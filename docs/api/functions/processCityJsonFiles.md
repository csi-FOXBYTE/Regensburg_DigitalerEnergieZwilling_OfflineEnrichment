[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../README.md) / processCityJsonFiles

# Function: processCityJsonFiles()

> **processCityJsonFiles**(`srcDir`, `options?`): `Promise`\<[`CityJsonAnalysisResult`](../interfaces/CityJsonAnalysisResult.md)\>

Defined in: [analysis/file-analyzer.ts:240](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/analysis/file-analyzer.ts#L240)

Analyzes all CityJSON files in a directory, enriches building attributes,
and writes updated files back. When `options.adjacency` is true a second
pass computes shared wall areas across all indexed buildings.

## Parameters

### srcDir

`string`

Source directory with JSON files.

### options?

[`ProcessCityJsonFilesOptions`](../interfaces/ProcessCityJsonFilesOptions.md) = `{}`

Options for CRS normalization and processing.

## Returns

`Promise`\<[`CityJsonAnalysisResult`](../interfaces/CityJsonAnalysisResult.md)\>

Aggregated result of file and building analysis.
