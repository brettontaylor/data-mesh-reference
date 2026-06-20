# AUTO-GENERATED from contracts/entities/counterparty.yaml — DO NOT EDIT BY HAND.
# Regenerate with: npm run generate
#
# Entity : Counterparty (counterparty)
# Group  : reference
# Grain  : one row per legal counterparty
# Owner  : reference-data
# Source : Reference data feed (csv; cadence 1d)
import dlt
from pyspark.sql import functions as F

@dlt.table(
    name="bronze_counterparty",
    comment="Raw landed counterparty from reference_feed. Archive-first, immutable.",
    table_properties={"quality": "bronze", "classification": "internal"},
)
def bronze_counterparty():
    return (
        spark.read.format("csv").option("header", True)
        .load("examples/data/counterparty.csv")
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source", F.lit("reference_feed"))
    )

@dlt.table(
    name="silver_counterparty",
    comment="Conformed & deduplicated counterparty, typed to the contract.",
    table_properties={"quality": "silver"},
)
@dlt.expect_or_drop("valid_pk", "counterparty_id IS NOT NULL")
def silver_counterparty():
    return (
        dlt.read("bronze_counterparty").select(
        F.col("counterparty_id").cast("string").alias("counterparty_id"),
        F.col("lei").cast("string").alias("lei"),
        F.col("legal_name").cast("string").alias("legal_name"),
        F.col("country_code").cast("string").alias("country_code"),
        F.col("credit_rating").cast("string").alias("credit_rating"),
        F.col("internal_risk_score").cast("int").alias("internal_risk_score"),
            F.col("_ingested_at"),
        ).dropDuplicates(["counterparty_id"])
    )

@dlt.table(
    name="gold_counterparty",
    comment="Curated counterparty mart, ready for the semantic layer.",
    table_properties={"quality": "gold"},
)
def gold_counterparty():
    # restricted columns excluded from gold mart: internal_risk_score
    return dlt.read("silver_counterparty").select("counterparty_id", "lei", "legal_name", "country_code", "credit_rating")

