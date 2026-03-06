[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../README.md) / CityJsonFileAnalysis

# Interface: CityJsonFileAnalysis

Defined in: [shared/types.ts:63](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L63)

Result status for one processed file.

## Properties

### filePath

> **filePath**: `string`

Defined in: [shared/types.ts:65](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L65)

Absolute path of the processed file.

***

### status

> **status**: `"analyzed"` \| `"skipped"`

Defined in: [shared/types.ts:67](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L67)

Processing status of the file.

***

### reason?

> `optional` **reason**: `string`

Defined in: [shared/types.ts:69](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L69)

Optional reason why a file was skipped.

***

### buildings?

> `optional` **buildings**: [`BuildingAnalysisResult`](BuildingAnalysisResult.md)[]

Defined in: [shared/types.ts:71](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/shared/types.ts#L71)

Building analysis results if the file was processed.
