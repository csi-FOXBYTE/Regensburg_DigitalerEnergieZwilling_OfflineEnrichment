[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../globals.md) / BuildingAnalysisResult

# Interface: BuildingAnalysisResult

Defined in: [shared/types.ts:49](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/dd79bff9e46196bbc7547cb27e1c6dc96c9177de/src/shared/types.ts#L49)

Analysis result for a single building object.

## Properties

### buildingId

> **buildingId**: `string`

Defined in: [shared/types.ts:51](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/dd79bff9e46196bbc7547cb27e1c6dc96c9177de/src/shared/types.ts#L51)

Unique CityObject ID.

***

### buildingType

> **buildingType**: `string`

Defined in: [shared/types.ts:53](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/dd79bff9e46196bbc7547cb27e1c6dc96c9177de/src/shared/types.ts#L53)

CityJSON object type, e.g. `Building` or `BuildingPart`.

***

### metrics

> **metrics**: [`BuildingGeometryMetrics`](BuildingGeometryMetrics.md)

Defined in: [shared/types.ts:55](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/dd79bff9e46196bbc7547cb27e1c6dc96c9177de/src/shared/types.ts#L55)

Calculated geometric metrics.
