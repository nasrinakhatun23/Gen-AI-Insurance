from __future__ import annotations

import math
import re
import zlib
from collections import Counter


class SimpleEmbeddingModel:
    def __init__(self, dimensions: int = 128) -> None:
        self.dimensions = dimensions

    def embed(self, text: str) -> list[float]:
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        counts = Counter(tokens)
        vector = [0.0] * self.dimensions

        for token, count in counts.items():
            index = zlib.crc32(token.encode("utf-8")) % self.dimensions
            vector[index] += float(count)

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector

        return [value / norm for value in vector]
