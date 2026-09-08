[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../README.md) / BuildingGeometryMetrics

# Interface: BuildingGeometryMetrics

Defined in: [shared/types.ts:25](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L25)

Aggregated geometric metrics of a building.

## Properties

### volume

> **volume**: `number`

Defined in: [shared/types.ts:27](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L27)

Building volume in cubic units of the CRS.

***

### groundArea

> **groundArea**: `number`

Defined in: [shared/types.ts:29](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L29)

Ground area.

***

### upperFloorArea

> **upperFloorArea**: `number`

Defined in: [shared/types.ts:31](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L31)

Upper floor area (currently tied to `groundArea`).

***

### grossExternalWallArea

> **grossExternalWallArea**: `number`

Defined in: [shared/types.ts:33](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L33)

Gross external wall area.

***

### grossExternalWallAreaWithoutAttic

> **grossExternalWallAreaWithoutAttic**: `number` \| `null`

Defined in: [shared/types.ts](../../../src/shared/types.ts)

Gross wall area at or below the largest roof island's minimum elevation; null when no roof is available.
Roof islands connect through shared 3D edge segments within 1 cm and are ranked
by combined surface area.

***

### grossExternalWallAreaAttic

> **grossExternalWallAreaAttic**: `number` \| `null`

Defined in: [shared/types.ts](../../../src/shared/types.ts)

Gross wall area above the largest roof island's minimum elevation; null when no roof is available.
Zero when the eaves are at or above the highest wall vertex. Together with
`grossExternalWallAreaWithoutAttic`, this equals `grossExternalWallArea`.

***

### roofArea

> **roofArea**: `number`

Defined in: [shared/types.ts:35](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L35)

Roof area.

***

### roofPitchDegrees

> **roofPitchDegrees**: `number` \| `null`

Defined in: [shared/types.ts:37](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L37)

Area-weighted mean roof pitch in degrees.

***

### height

> **height**: `number` \| `null`

Defined in: [shared/types.ts:39](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L39)

Building height as the difference between minimum ground Z and maximum roof Z.

***

### envelopeArea

> **envelopeArea**: `number`

Defined in: [shared/types.ts:41](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L41)

Envelope area from ground, wall, and roof surfaces.
