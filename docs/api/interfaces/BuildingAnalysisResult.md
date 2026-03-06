[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../README.md) / BuildingAnalysisResult

# Interface: BuildingAnalysisResult

Defined in: [shared/types.ts:49](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L49)

Analysis result for a single building object.

## Properties

### buildingId

> **buildingId**: `string`

Defined in: [shared/types.ts:51](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L51)

Unique CityObject ID.

***

### buildingType

> **buildingType**: `string`

Defined in: [shared/types.ts:53](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L53)

CityJSON object type, e.g. `Building` or `BuildingPart`.

***

### metrics

> **metrics**: [`BuildingGeometryMetrics`](BuildingGeometryMetrics.md)

Defined in: [shared/types.ts:55](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L55)

Calculated geometric metrics.
