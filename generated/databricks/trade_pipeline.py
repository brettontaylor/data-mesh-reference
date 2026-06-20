# AUTO-GENERATED from contracts/entities/trade.yaml — DO NOT EDIT BY HAND.
# Regenerate with: npm run generate
#
# Entity : Trade (trade)
# Group  : transaction
# Grain  : one row per executed trade
# Owner  : trading-data
# Source : Trades & positions feed (csv; cadence 1d)
import dlt
from pyspark.sql import functions as F

@dlt.table(
    name="bronze_trade",
    comment="Raw landed trade from trades_feed. Archive-first, immutable.",
    table_properties={"quality": "bronze", "classification": "confidential"},
)
def bronze_trade():
    return (
        spark.read.format("csv").option("header", True)
        .load("examples/data/trade.csv")
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source", F.lit("trades_feed"))
    )

@dlt.table(
    name="silver_trade",
    comment="Conformed & deduplicated trade, typed to the contract.",
    table_properties={"quality": "silver"},
)
@dlt.expect_or_drop("valid_pk", "trade_id IS NOT NULL")
def silver_trade():
    return (
        dlt.read("bronze_trade").select(
        F.col("trade_id").cast("string").alias("trade_id"),
        F.col("trade_date").cast("date").alias("trade_date"),
        F.col("instrument_id").cast("string").alias("instrument_id"),
        F.col("counterparty_id").cast("string").alias("counterparty_id"),
        F.col("side").cast("string").alias("side"),
        F.col("quantity").cast("decimal(18,4)").alias("quantity"),
        F.col("price").cast("decimal(18,6)").alias("price"),
        F.col("notional").cast("decimal(18,2)").alias("notional"),
        F.col("currency_code").cast("string").alias("currency_code"),
        F.col("trader_id").cast("string").alias("trader_id"),
            F.col("_ingested_at"),
        ).dropDuplicates(["trade_id"])
    )

@dlt.table(
    name="gold_trade",
    comment="Curated trade mart, ready for the semantic layer.",
    table_properties={"quality": "gold"},
)
def gold_trade():
    # restricted columns excluded from gold mart: trader_id
    return dlt.read("silver_trade").select("trade_id", "trade_date", "instrument_id", "counterparty_id", "side", "quantity", "price", "notional", "currency_code")

