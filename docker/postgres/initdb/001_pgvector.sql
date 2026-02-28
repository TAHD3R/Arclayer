-- Enable pgvector extension for new databases.
-- Note: This script is only executed on first initialization of the data volume.
CREATE EXTENSION IF NOT EXISTS vector;
