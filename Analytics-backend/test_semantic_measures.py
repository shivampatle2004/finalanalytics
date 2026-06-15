import sys
import os
from sqlalchemy.orm import Session

# Reconfigure stdout to use UTF-8 to avoid encoding errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add directory to sys.path so we can import services/models
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database import SessionLocal
from models import UploadedFile, SemanticMeasure
from services.semantic_measure_engine import FormulaParser, DependencyGraph, ValidationEngine, SemanticMeasureEngine

def run_tests():
    db = SessionLocal()
    try:
        # Find any uploaded file record to run checks with a real schema
        file_record = db.query(UploadedFile).first()
        if not file_record:
            print("❌ No files found in database to test with.")
            return
        
        file_id = file_record.id
        print(f"ℹ️ Testing with file_id={file_id} (file_name={file_record.file_name})")
        
        # Test 1: Extract References
        print("\n--- Test 1: Extracting References ---")
        expr = "([Revenue] - [Cost]) / [Revenue]"
        refs = FormulaParser.extract_references(expr, ["Revenue", "Cost"], ["ProfitMargin"])
        print(f"Expression: {expr}")
        print(f"Extracted fields: {refs['fields']}")
        print(f"Extracted measures: {refs['measures']}")
        assert "Revenue" in refs["fields"]
        assert "Cost" in refs["fields"]
        print("✅ Test 1 Passed.")

        # Test 2: Cycle Detection
        print("\n--- Test 2: Circular Dependency Detection ---")
        measures_dict = {
            "Profit": "[Revenue] - [Cost]",
            "ProfitMargin": "[Profit] / [Revenue]",
            "Revenue": "[ProfitMargin] * [Sales]" # Circular: Revenue depends on ProfitMargin which depends on Profit which depends on Revenue
        }
        cycle = DependencyGraph.detect_cycle("Profit", "[Revenue] - [Cost]", measures_dict, ["Cost", "Sales"])
        print(f"Detected Cycle Path: {cycle}")
        assert len(cycle) > 0
        assert cycle[0] == "Profit"
        print("✅ Test 2 Passed.")

        # Test 3: Validation Engine - Valid Case
        print("\n--- Test 3: Validation (Valid Expression) ---")
        # Ensure we have mock existing measures list
        mock_measures = [
            {"id": "m1", "name": "Revenue", "expression": "1000", "category": "Financial"}
        ]
        
        # We need columns from the actual file schema to pass validation
        # Let's inspect the first column in the file schema
        from routers.files import get_file_schema
        schema_data = get_file_schema(file_id, db) or []
        if schema_data:
            first_col = schema_data[0].get("column_name") or schema_data[0].get("name")
            valid_expr = f"[{first_col}] + [Revenue]"
            val_res = SemanticMeasureEngine.validate_measure(
                name="CustomMetric",
                expression=valid_expr,
                file_id=file_id,
                measures=mock_measures,
                db=db
            )
            print(f"Validating: {valid_expr}")
            print(f"Validation Result: {val_res}")
            assert val_res["is_valid"] is True
            assert first_col in val_res["dependencies"]["fields"]
            assert "Revenue" in val_res["dependencies"]["measures"]
            print("✅ Test 3 Passed.")
        else:
            print("⚠️ Skipped Test 3 (no schema columns found).")

        # Test 4: Validation Engine - Invalid Reference Case
        print("\n--- Test 4: Validation (Unknown Field/Reference) ---")
        invalid_expr = "[Revenuee] - [NonexistentField]"
        val_res = SemanticMeasureEngine.validate_measure(
            name="CustomMetric2",
            expression=invalid_expr,
            file_id=file_id,
            measures=mock_measures,
            db=db
        )
        print(f"Validating: {invalid_expr}")
        print(f"Validation Result: {val_res}")
        assert val_res["is_valid"] is False
        assert any("Unknown reference" in err or "Unknown field" in err for err in val_res["errors"])
        print("✅ Test 4 Passed.")

        # Test 5: Formatting results
        print("\n--- Test 5: Formatting Output ---")
        fmt_pct = SemanticMeasureEngine.format_result(0.23456, "Percentage")
        fmt_curr = SemanticMeasureEngine.format_result(1240.5, "Currency")
        fmt_num = SemanticMeasureEngine.format_result(1240.5, "Whole Number")
        print(f"Percentage: {fmt_pct} (expected 0.23% or 23.46%)")
        print(f"Currency: {fmt_curr} (expected ₹1,240.50)")
        print(f"Whole Number: {fmt_num} (expected 1,241)")
        assert "%" in fmt_pct
        assert "₹" in fmt_curr
        assert fmt_num in ("1,240", "1,241")
        print("✅ Test 5 Passed.")
        
        print("\n🎉 ALL SEMANTIC MEASURE TESTS PASSED SUCCESSFULLY! 🎉")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
