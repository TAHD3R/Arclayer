from __future__ import annotations

from pydantic import ConfigDict

from src.common.schemas import BaseSchema


class ByteRange(BaseSchema):
    """
    Inclusive byte range [start, end].
    """

    model_config = ConfigDict(frozen=True)

    start: int
    end: int

    @property
    def length(self) -> int:
        return self.end - self.start + 1


def parse_range_header(range_header: str | None, *, size: int) -> tuple[int, int] | None:
    """
    Parse a single HTTP Range header for bytes.

    Supported forms (RFC 9110 compatible subset):
    - bytes=start-end
    - bytes=start-
    - bytes=-suffix_length

    Notes:
    - Multiple ranges (comma-separated) are rejected.
    - Returns None if header is missing.
    - Raises ValueError for invalid or unsatisfiable ranges.
    """

    if range_header is None:
        return None
    raw = range_header.strip()
    if not raw:
        return None
    if size < 0:
        raise ValueError("invalid size")

    if not raw.startswith("bytes="):
        raise ValueError("range unit not supported")

    spec = raw[len("bytes=") :].strip()
    if "," in spec:
        raise ValueError("multiple ranges not supported")
    if "-" not in spec:
        raise ValueError("invalid range")

    start_s, end_s = spec.split("-", 1)
    start_s = start_s.strip()
    end_s = end_s.strip()

    if size == 0:
        raise ValueError("empty resource")

    # Suffix byte range: "-N" means last N bytes.
    if start_s == "":
        if end_s == "":
            raise ValueError("invalid suffix range")
        suffix = int(end_s)
        if suffix <= 0:
            raise ValueError("invalid suffix length")
        start = max(size - suffix, 0)
        end = size - 1
        return (start, end)

    start = int(start_s)
    if start < 0:
        raise ValueError("invalid start")
    if start >= size:
        raise ValueError("range start out of bounds")

    if end_s == "":
        return (start, size - 1)

    end = int(end_s)
    if end < 0:
        raise ValueError("invalid end")
    if end >= size:
        raise ValueError("range end out of bounds")
    if end < start:
        raise ValueError("range inverted")
    return (start, end)
