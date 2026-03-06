[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../globals.md) / processCityJsonFiles

# Function: processCityJsonFiles()

> **processCityJsonFiles**(`srcDir`, `options?`): `Promise`\<[`CityJsonAnalysisResult`](../interfaces/CityJsonAnalysisResult.md)\>

Defined in: [analysis/file-analyzer.ts:22](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/dd79bff9e46196bbc7547cb27e1c6dc96c9177de/src/analysis/file-analyzer.ts#L22)

Analyzes all CityJSON files in a directory, enriches building attributes,
and writes updated files back.

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
