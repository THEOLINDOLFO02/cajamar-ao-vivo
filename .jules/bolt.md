
## 2024-05-24 - Haversine Formula Bottleneck on Large CSV Parsing
**Learning:** Parsing large CSV files and checking distances with the Haversine formula for every row is extremely CPU intensive, especially when trigonometric functions (sine, cosine, atan2) run thousands of times.
**Action:** Always use a simple Bounding Box (BBox) pre-filter first using basic arithmetic (`Math.abs(lat - targetLat) > limitGraus`) to reject points before calculating the precise Haversine distance. Remember to adjust longitude degrees limit using the cosine of the latitude!

## 2024-05-24 - Regex Overhead in High-Frequency Loops
**Learning:** Using regex to parse simple fixed-format data (like standard timestamps "YYYY-MM-DD HH:MM:SS" or state acronyms) inside loops running over 100k+ elements causes measurable overhead compared to direct string operations (`slice`, `===`).
**Action:** When a known format is expected in tight loops, use string slicing and direct comparisons as a fast-path, falling back to regex only if the string deviates from the expected structure.
