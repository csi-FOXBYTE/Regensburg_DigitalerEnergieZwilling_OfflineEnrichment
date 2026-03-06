[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../README.md) / BuildingGeometryMetrics

# Interface: BuildingGeometryMetrics

Defined in: [shared/types.ts:25](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L25)

Aggregated geometric metrics of a building.

## Properties

### volume

> **volume**: `number`

Defined in: [shared/types.ts:27](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L27)

Building volume in cubic units of the CRS.

***

### groundArea

> **groundArea**: `number`

Defined in: [shared/types.ts:29](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L29)

Ground area.

***

### upperFloorArea

> **upperFloorArea**: `number`

Defined in: [shared/types.ts:31](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L31)

Upper floor area (currently tied to `groundArea`).

***

### grossExternalWallArea

> **grossExternalWallArea**: `number`

Defined in: [shared/types.ts:33](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L33)

Gross external wall area.

***

### roofArea

> **roofArea**: `number`

Defined in: [shared/types.ts:35](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L35)

Roof area.

***

### roofPitchDegrees

> **roofPitchDegrees**: `number` \| `null`

Defined in: [shared/types.ts:37](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L37)

Area-weighted mean roof pitch in degrees.

***

### height

> **height**: `number` \| `null`

Defined in: [shared/types.ts:39](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L39)

Building height as the difference between minimum ground Z and maximum roof Z.

***

### envelopeArea

> **envelopeArea**: `number`

Defined in: [shared/types.ts:41](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L41)

Envelope area from ground, wall, and roof surfaces.
