import ast
import re
from typing import Dict, Any, List, Set, Tuple, Optional
import pandas as pd
from sqlalchemy.orm import Session

from models import UploadedFile
from services.model_engine import ModelEngine
from services.quick_measure_engine import MeasureRegistry, _evaluate_measure_expression


class FormulaParser:
    """Parser abstraction layer to extract references from formula expressions,
    decoupling future parsing logic from python AST.
    """

    @staticmethod
    def extract_references(expression: str, columns: List[str], existing_measures: List[str]) -> Dict[str, List[str]]:
        """Identify referenced fields and measures from a formula expression."""
        referenced_fields = set()
        referenced_measures = set()

        # 1. Extract bracketed terms: e.g. [Profit Margin] or [Revenue]
        bracket_pattern = re.compile(r'\[([^\]]+)\]')
        bracketed = bracket_pattern.findall(expression)

        col_set = set(columns)
        meas_set = set(existing_measures)

        for term in bracketed:
            if term in col_set:
                referenced_fields.add(term)
            elif term in meas_set:
                referenced_measures.add(term)
            else:
                # If it's bracketed, treat it as a field or measure based on heuristic or just add to fields
                referenced_fields.add(term)

        # 2. Extract plain words: e.g. Revenue - Cost
        # To avoid false positives on functions/operators, match alphanumeric names
        word_pattern = re.compile(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b')
        words = word_pattern.findall(expression)

        # Common functions and keywords to ignore
        ignored_keywords = {
            "DIVIDE", "sum", "avg", "min", "max", "count", "median", "mode", "std", "var",
            "ytd", "mtd", "qtd", "cagr", "SUM", "MIN", "MAX", "AVG", "COUNT", "MEDIAN", "MODE",
            "prev", "next", "first", "last", "lookup", "total", "if", "else", "then", "and", "or", "not"
        }

        for word in words:
            if word in ignored_keywords:
                continue
            if word in col_set:
                referenced_fields.add(word)
            elif word in meas_set:
                referenced_measures.add(word)

        return {
            "fields": sorted(list(referenced_fields)),
            "measures": sorted(list(referenced_measures))
        }


class DependencyGraph:
    """Dependency graph manager to visualize dependencies, prevent circular references,
    and manage invalidation paths.
    """

    @staticmethod
    def detect_cycle(
        target_name: str,
        expression: str,
        measures_dict: Dict[str, str],
        columns: List[str],
        visited: Optional[Set[str]] = None,
        stack: Optional[Set[str]] = None
    ) -> List[str]:
        """Detect circular dependencies using DFS. Returns the cycle path list if found, empty list otherwise."""
        if visited is None:
            visited = set()
        if stack is None:
            stack = set()

        visited.add(target_name)
        stack.add(target_name)

        refs = FormulaParser.extract_references(expression, columns, list(measures_dict.keys()))
        for dep in refs["measures"]:
            if dep in stack:
                # Cycle found!
                cycle_list = list(stack)
                cycle_list.append(dep)
                # Trim list to show path starting at the duplicate element
                start_idx = cycle_list.index(dep)
                return cycle_list[start_idx:]
            if dep not in visited:
                dep_expr = measures_dict.get(dep, "")
                cycle_path = DependencyGraph.detect_cycle(dep, dep_expr, measures_dict, columns, visited, stack)
                if cycle_path:
                    return cycle_path

        stack.remove(target_name)
        return []

    @staticmethod
    def get_impacted_objects(
        measure_name: str,
        measures: List[Dict[str, Any]],
        dashboards: List[Dict[str, Any]]
    ) -> List[Dict[str, str]]:
        """Calculate impact analysis before deletion. Finds where this measure is used."""
        impact = []

        # Find depending measures
        for m in measures:
            if m.get("name") == measure_name:
                continue
            expr = m.get("expression") or ""
            refs = FormulaParser.extract_references(expr, [], [measure_name])
            if measure_name in refs["measures"]:
                impact.append({
                    "type": "measure",
                    "name": m.get("name"),
                    "details": f"Referenced in formula of '{m.get('name')}'"
                })

        # Find depending dashboard cards/visuals
        for dash in dashboards:
            for g in dash.get("graphs", []):
                opts = g.get("options") or {}
                measure_fields = opts.get("measure_fields") or []
                referenced = False
                for mf in measure_fields:
                    if mf.get("column") == measure_name:
                        referenced = True
                        break
                if referenced:
                    impact.append({
                        "type": "visual",
                        "name": opts.get("title") or g.get("graph_type", "Visual"),
                        "details": f"Used in chart on page '{opts.get('pageId', 'Page 1')}'"
                    })

        return impact


class ValidationEngine:
    """Validation service checking syntax, references, datatypes and dependency rules."""

    @staticmethod
    def validate(
        name: str,
        expression: str,
        file_id: str,
        measures: List[Dict[str, Any]],
        db: Session
    ) -> Dict[str, Any]:
        """Validate measure settings and expression rules."""
        errors = []
        warnings = []

        # 1. Basic Name Checks
        if not name or not name.strip():
            errors.append("Measure name cannot be empty.")
            return {"is_valid": False, "errors": errors, "warnings": warnings, "dependencies": {"fields": [], "measures": []}}

        name = name.strip()
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_\s]*$', name):
            errors.append("Measure name contains invalid characters. Use letters, numbers, and underscores.")

        # Load file schema/columns
        file_record = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
        if not file_record:
            errors.append("Data model file not found.")
            return {"is_valid": False, "errors": errors, "warnings": warnings, "dependencies": {"fields": [], "measures": []}}

        # Extract column names and types from database file schema
        schema_cols = []
        schema_types = {}
        try:
            from routers.files import get_file_schema
            schema_data = get_file_schema(file_id, db) or []
            for col in schema_data:
                col_name = col.get("column_name") or col.get("name")
                if col_name:
                    schema_cols.append(col_name)
                    schema_types[col_name] = col.get("data_type") or col.get("type") or "numeric"
        except Exception as e:
            errors.append(f"Failed to load dataset schema: {str(e)}")
            return {"is_valid": False, "errors": errors, "warnings": warnings, "dependencies": {"fields": [], "measures": []}}

        # Create dict of other measures
        measures_dict = {m["name"]: m.get("expression") or "" for m in measures if m.get("name") != name}

        # 2. Syntax Check (AST hidden behind service)
        # Normalize bracketed references first so python AST can parse it
        bracket_pattern = re.compile(r'\[([^\]]+)\]')
        normalized_expr = expression
        bracketed_terms = bracket_pattern.findall(expression)
        for idx, term in enumerate(bracketed_terms):
            safe_id = f"__safe_ref_{idx}"
            normalized_expr = normalized_expr.replace(f"[{term}]", safe_id)

        try:
            ast.parse(normalized_expr, mode="eval")
        except SyntaxError as se:
            errors.append(f"Syntax Error: {se.msg} at position {se.offset or 0}")
            return {"is_valid": False, "errors": errors, "warnings": warnings, "dependencies": {"fields": [], "measures": []}}
        except Exception as e:
            errors.append(f"Expression compilation failed: {str(e)}")
            return {"is_valid": False, "errors": errors, "warnings": warnings, "dependencies": {"fields": [], "measures": []}}

        # 3. Extract and validate references
        refs = FormulaParser.extract_references(expression, schema_cols, list(measures_dict.keys()))
        
        # Check for unknown fields or measures
        all_existing_measures = set(measures_dict.keys())
        all_existing_cols = set(schema_cols)

        # Validate bracketed references specifically to catch misspellings
        for term in bracketed_terms:
            if term not in all_existing_measures and term not in all_existing_cols:
                errors.append(f"Unknown reference: '{term}' is neither a column nor a measure.")

        # Check all plain name references
        for f in refs["fields"]:
            if f not in all_existing_cols:
                # Maybe misspelled or is a measure
                if f in all_existing_measures:
                    refs["measures"].append(f)
                    refs["fields"].remove(f)
                else:
                    errors.append(f"Unknown field: '{f}' is not present in the dataset.")

        for m_name in refs["measures"]:
            if m_name not in all_existing_measures:
                errors.append(f"Unknown measure: '{m_name}' is not defined.")

        # 4. Check Data Type Mismatch
        numeric_types = {"numeric", "integer", "float", "int", "decimal", "double", "real", "number"}
        for f in refs["fields"]:
            if f in schema_types:
                col_type = str(schema_types[f]).lower()
                if not any(t in col_type for t in numeric_types):
                    # Warning or error? Mathematical ops require numeric fields.
                    warnings.append(f"Field '{f}' is of type '{col_type}'. Mathematical operations require numeric fields.")

        # 5. Check Circular References
        # Add the current measure to the dict to trace
        full_measures_dict = dict(measures_dict)
        full_measures_dict[name] = expression

        cycle_path = DependencyGraph.detect_cycle(name, expression, full_measures_dict, schema_cols)
        if cycle_path:
            cycle_str = " → ".join(cycle_path)
            errors.append(f"Circular dependency: {cycle_str}")

        is_valid = len(errors) == 0
        return {
            "is_valid": is_valid,
            "errors": errors,
            "warnings": warnings,
            "dependencies": {
                "fields": sorted(list(set(refs["fields"]))),
                "measures": sorted(list(set(refs["measures"])))
            }
        }


class SemanticMeasureEngine:
    """Core coordinator for custom semantic measures validation, preview, and execution."""

    @staticmethod
    def validate_measure(
        name: str,
        expression: str,
        file_id: str,
        measures: List[Dict[str, Any]],
        db: Session
    ) -> Dict[str, Any]:
        """Validate syntax, dependency, circular constraints, and references."""
        return ValidationEngine.validate(name, expression, file_id, measures, db)

    @staticmethod
    def calculate_preview(
        name: str,
        expression: str,
        file_id: str,
        measures: List[Dict[str, Any]],
        format_type: str,
        group_by: Optional[str],
        db: Session,
        decimal_places: int = 2,
        currency: Optional[str] = None,
        display_units: str = "None"
    ) -> Dict[str, Any]:
        """Load dataset, evaluate formula in standard context, and return a preview result."""
        # 1. Validate first
        val = ValidationEngine.validate(name, expression, file_id, measures, db)
        if not val["is_valid"]:
            return {"result": None, "error": val["errors"][0]}

        try:
            # 2. Load dataframe
            df = ModelEngine.load_report_dataframe(file_id, db)
            if df is None or df.empty:
                return {"result": None, "error": "No data rows available in the model."}

            # 3. Build local measures dictionary for evaluation
            # Make sure to map measure_name -> expression
            measures_dict = {m["name"]: m["expression"] for m in measures if m.get("name") != name}
            measures_dict[name] = expression

            # 4. Resolve expression
            result = MeasureRegistry.resolve(
                name,
                df,
                {"measures": measures_dict},
                group_by
            )

            # 5. Format formatted preview
            formatted = SemanticMeasureEngine.format_result(
                result,
                format_type,
                decimal_places=decimal_places,
                currency=currency,
                display_units=display_units
            )
            
            return {
                "result": result,
                "formatted": formatted,
                "error": None
            }
        except Exception as e:
            return {"result": None, "error": f"Evaluation Error: {str(e)}"}

    @staticmethod
    def format_result(
        result: Any,
        format_type: str,
        decimal_places: int = 2,
        currency: Optional[str] = None,
        display_units: str = "None"
    ) -> Any:
        """Format a preview scalar value or dictionary of values according to the format configuration."""
        if result is None:
            return "BLANK"

        def _fmt(v):
            if v is None:
                return "BLANK"
            try:
                val = float(v)
            except (ValueError, TypeError):
                return str(v)

            # Apply scale divisor
            scaled_val = val
            suffix = ""
            if format_type not in ["Percentage", "Growth Rate"]:
                if display_units == "Thousands":
                    scaled_val = val / 1000.0
                    suffix = "K"
                elif display_units == "Millions":
                    scaled_val = val / 1000000.0
                    suffix = "M"
                elif display_units == "Billions":
                    scaled_val = val / 1000000000.0
                    suffix = "B"

            # Formatted number representation
            dec = decimal_places if decimal_places is not None else 2
            formatted_num = f"{scaled_val:,.{dec}f}"
            
            # Remove trailing . if dec is 0
            if dec == 0 and formatted_num.endswith("."):
                formatted_num = formatted_num[:-1]

            if format_type == "Percentage":
                return f"{formatted_num}%"
            elif format_type == "Growth Rate":
                sign = "+" if val > 0 else ""
                return f"{sign}{formatted_num}%"
            elif format_type == "Currency":
                symbol = currency or "₹"
                return f"{symbol}{formatted_num}{suffix}"
            elif format_type == "Whole Number":
                return f"{int(round(val)):,}"
            
            # Default or Custom/Decimal Number
            if currency:
                return f"{currency}{formatted_num}{suffix}"
            return f"{formatted_num}{suffix}"

        if isinstance(result, dict):
            return {k: _fmt(v) for k, v in result.items()}
        return _fmt(result)
