from dlt.extract.exceptions import DltResourceException


class InsightsJobTimeout(DltResourceException):
    pass


class ConnectorConnectionError(Exception):
    """Raised when a connector cannot reach its data source (surfaced to the UI)."""
