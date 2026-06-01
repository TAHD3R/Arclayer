-- Create LiteLLM database.
-- LiteLLM uses this database for spend logs, virtual key storage, and proxy state.
-- Note: This script is only executed on first initialization of the data volume.
CREATE DATABASE litellm;
