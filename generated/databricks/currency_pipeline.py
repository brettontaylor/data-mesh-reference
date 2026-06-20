# AUTO-GENERATED from contracts/entities/currency.yaml — DO NOT EDIT BY HAND.
# Regenerate with: npm run generate
#
# Entity : Currency (currency)
# Group  : reference
# Grain  : one row per ISO 4217 currency
# Owner  : reference-data
# Source : Reference data feed (csv; cadence 1d)
import dlt
from pyspark.sql import functions as F

@dlt.table(
    name="bronze_currency",
    comment="Raw landed currency from reference_feed. Archive-first, immutable.",
    table_properties={"quality": "bronze", "classification": "internal"},
)
def bronze_currency():
    return (
        spark.read.format("csv").option("header", True)
        .load("examples/data/currency.csv")
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source", F.lit("reference_feed"))
    )

@dlt.table(
    name="silver_currency",
    comment="Conformed & deduplicated currency, typed to the contract.",
    table_properties={"quality": "silver"},
)
@dlt.expect_or_drop("valid_pk", "currency_code IS NOT NULL")
def silver_currency():
    return (
        dlt.read("bronze_currency").select(
        F.col("currency_code").cast("string").alias("currency_code"),
        F.col("name").cast("string").alias("name"),
        F.col("minor_units").cast("int").alias("minor_units"),
            F.col("_ingested_at"),
        ).dropDuplicates(["currency_code"])
    )

@dlt.table(
    name="gold_currency",
    comment="Curated currency mart, ready for the semantic layer.",
    table_properties={"quality": "gold"},
)
def gold_currency():
    return dlt.read("silver_currency").select("currency_code", "name", "minor_units")

