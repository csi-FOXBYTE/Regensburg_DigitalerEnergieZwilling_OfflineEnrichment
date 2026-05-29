# Address Parsing Schema

## Source Format

The `ThoroughfareName` field in the Bavarian CityGML/CityJSON data can encode multiple
street addresses in a single string, separated by `;`. Each address segment has the form
`<street name> <house numbers>`. House numbers can be comma-separated lists. Some entries
end with `u.a.` (German abbreviation for "und andere" = "and others"), indicating a
truncated list.

## Parsing Steps

1. Split `ThoroughfareName` on `;` → list of address segments
2. For each segment: split at the **last space**
   - Right part starts with a digit → `street` = left part, `houseNumbers` = right part
   - Right part does not start with a digit (e.g. `u.a.`) → skip this segment
3. Split `houseNumbers` on `,` → list of individual numbers
4. Insert **one database row per house number** with the same `building_id` and coordinates

## Examples

| ThoroughfareName | Result |
|---|---|
| `"Hauptstraße 5"` | 1 row: Hauptstraße / 5 |
| `"Hauptstraße 5,5a,7"` | 3 rows: Hauptstraße / 5, 5a, 7 |
| `"Alte Straße 1;Keltenstraße 5"` | 2 rows: Alte Straße / 1, Keltenstraße / 5 |
| `"Karl-Stieler-Straße 50,52;Karl u.a."` | 2 rows: Karl-Stieler-Straße / 50, 52 — `u.a.` segment skipped |
| `"Sarmanna-Straße 16,18;Sarmanna-Straße"` | 2 rows from first segment, second segment has no number → skip |

## Database Schema

`building_id` is no longer a primary key since one building can have multiple address rows
(one per street / house number combination).

```sql
CREATE TABLE streets (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE building_addresses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id  TEXT NOT NULL,
  street_id    INTEGER NOT NULL REFERENCES streets(id),
  house_number TEXT,
  cx           REAL NOT NULL,
  cy           REAL NOT NULL
);

CREATE INDEX idx_building_addresses_building_id
  ON building_addresses (building_id);

CREATE INDEX idx_building_addresses_street_house
  ON building_addresses (street_id, house_number);
```

## Observed Data Quality

Based on analysis of the Regensburg dataset (32,518 buildings, 1,745 streets):

- **97.0%** clean single-address entries
- **2.6%** comma-separated house number lists (multi-entrance buildings)
- **6.9%** of street names contain semicolons due to the current single-pass parsing —
  these are corner buildings whose second address was folded into the street name field
- **3** entries with `NULL` house number, all caused by `u.a.`-terminated address strings
- All building IDs follow the `DEBY_LOD2_*` pattern
- Coordinates are fully within the expected Regensburg bounding box (EPSG:25832)
