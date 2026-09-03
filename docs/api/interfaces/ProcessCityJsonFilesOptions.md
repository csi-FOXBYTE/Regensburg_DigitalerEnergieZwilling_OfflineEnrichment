[**@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment**](../README.md)

***

[@csi-foxbyte/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment](../README.md) / ProcessCityJsonFilesOptions

# Interface: ProcessCityJsonFilesOptions

Defined in: [shared/types.ts:99](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L99)

Options for file processing.

## Extends

- [`GeometryCrsOptions`](GeometryCrsOptions.md)

## Properties

### sourceCrsFallback?

> `optional` **sourceCrsFallback**: `string`

Defined in: [shared/types.ts:91](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L91)

Source CRS fallback when `metadata.referenceSystem` is missing.

#### Inherited from

[`GeometryCrsOptions`](GeometryCrsOptions.md).[`sourceCrsFallback`](GeometryCrsOptions.md#sourcecrsfallback)

***

### outDir?

> `optional` **outDir**: `string`

Defined in: [shared/types.ts:101](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L101)

Output directory; writes in place when omitted.

***

### adjacency?

> `optional` **adjacency**: `boolean`

Defined in: [shared/types.ts:103](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L103)

When true, runs the adjacency pass after indexing all buildings.

***

### adjacencyTolerance?

> `optional` **adjacencyTolerance**: `number`

Defined in: [shared/types.ts:105](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L105)

Maximum distance in metres between wall faces to count as adjacent. Defaults to 0.15.

***

### addressOutput?

> `optional` **addressOutput**: `string`

Defined in: [shared/types.ts:107](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L107)

When set, writes building addresses to a SQLite file at this path.

***

### municipalityKey?

> `optional` **municipalityKey**: `string`

Defined in: [shared/types.ts:109](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L109)

Retain only CityObjects whose adapter-provided municipality key matches this value.

***

### ageZonesFile?

> `optional` **ageZonesFile**: `string`

Defined in: [shared/types.ts:111](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L111)

When set, enriches buildings with construction year from the given GeoPackage.

***

### geothermalFile?

> `optional` **geothermalFile**: `string`

Defined in: [shared/types.ts:113](https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment/blob/febf6e757a2cad6ca4eb875caf191f3e6ea0ad64/src/shared/types.ts#L113)

When set, enriches buildings with groundwater heat-pump availability from the given GeoPackage.
