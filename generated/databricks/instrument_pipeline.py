# AUTO-GENERATED from contracts/bdm/instrument.yaml — DO NOT EDIT BY HAND.
# Regenerate with: npm run generate
#
# Entity : Instrument (instrument)
# Group  : reference
# Grain  : one row per tradable instrument
# Owner  : reference-data
# Source : Reference data feed (csv; cadence 1d)
import dlt
from pyspark.sql import functions as F

@dlt.table(
    name="bronze_instrument",
    comment="Raw landed instrument from reference_feed. Archive-first, immutable.",
    table_properties={"quality": "bronze", "classification": "internal"},
)
def bronze_instrument():
    return (
        spark.read.format("csv").option("header", True)
        .load("examples/data/instrument.csv")
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source", F.lit("reference_feed"))
    )

@dlt.table(
    name="silver_instrument",
    comment="Conformed & deduplicated instrument, typed to the contract.",
    table_properties={"quality": "silver"},
)
@dlt.expect_or_drop("valid_pk", "instrument_id IS NOT NULL")
def silver_instrument():
    return (
        dlt.read("bronze_instrument").select(
        F.col("instrument_id").cast("string").alias("instrument_id"),
        F.col("isin").cast("string").alias("isin"),
        F.col("cusip").cast("string").alias("cusip"),
        F.col("name").cast("string").alias("name"),
        F.col("asset_class").cast("string").alias("asset_class"),
        F.col("currency_code").cast("string").alias("currency_code"),
            F.col("_ingested_at"),
        ).dropDuplicates(["instrument_id"])
    )

@dlt.table(
    name="gold_instrument",
    comment="Curated instrument mart, ready for the semantic layer.",
    table_properties={"quality": "gold"},
)
def gold_instrument():
    return dlt.read("silver_instrument").select("instrument_id", "isin", "cusip", "name", "asset_class", "currency_code")

