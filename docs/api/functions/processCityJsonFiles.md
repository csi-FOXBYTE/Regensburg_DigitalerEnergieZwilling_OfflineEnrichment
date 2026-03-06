[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../README.md) / processCityJsonFiles

# Function: processCityJsonFiles()

> **processCityJsonFiles**(`srcDir`, `options?`): `Promise`\<[`CityJsonAnalysisResult`](../interfaces/CityJsonAnalysisResult.md)\>

Defined in: [analysis/file-analyzer.ts:22](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/ba08fb4f8cec76c2978818da233e983d31d1b7b5/src/analysis/file-analyzer.ts#L22)

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
