-- Tiger Cloud services ship TimescaleDB. pgvector gives us vector search.
-- pgvectorscale (DiskANN) is optional; we use pgvector HNSW, which is plenty for 30 to 50 pages.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;
