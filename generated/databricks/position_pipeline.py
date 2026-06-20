# AUTO-GENERATED from contracts/entities/position.yaml — DO NOT EDIT BY HAND.
# Regenerate with: npm run generate
#
# Entity : Position (position)
# Group  : position
# Grain  : one row per book / instrument / as-of date
# Owner  : trading-data
# Source : Trades & positions feed (csv; cadence 1d)
import dlt
from pyspark.sql import functions as F

@dlt.table(
    name="bronze_position",
    comment="Raw landed position from trades_feed. Archive-first, immutable.",
    table_properties={"quality": "bronze", "classification": "confidential"},
)
def bronze_position():
    return (
        spark.read.format("csv").option("header", True)
        .load("examples/data/position.csv")
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source", F.lit("trades_feed"))
    )

@dlt.table(
    name="silver_position",
    comment="Conformed & deduplicated position, typed to the contract.",
    table_properties={"quality": "silver"},
)
@dlt.expect_or_drop("valid_pk", "position_id IS NOT NULL")
def silver_position():
    return (
        dlt.read("bronze_position").select(
        F.col("position_id").cast("string").alias("position_id"),
        F.col("book_id").cast("string").alias("book_id"),
        F.col("instrument_id").cast("string").alias("instrument_id"),
        F.col("as_of_date").cast("date").alias("as_of_date"),
        F.col("quantity").cast("decimal(18,4)").alias("quantity"),
        F.col("market_value").cast("decimal(18,2)").alias("market_value"),
        F.col("currency_code").cast("string").alias("currency_code"),
            F.col("_ingested_at"),
        ).dropDuplicates(["position_id"])
    )

@dlt.table(
    name="gold_position",
    comment="Curated position mart, ready for the semantic layer.",
    table_properties={"quality": "gold"},
)
def gold_position():
    return dlt.read("silver_position").select("position_id", "book_id", "instrument_id", "as_of_date", "quantity", "market_value", "currency_code")

