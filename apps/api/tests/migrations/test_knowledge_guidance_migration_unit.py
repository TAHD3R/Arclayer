from importlib import import_module


def test_knowledge_guidance_public_migration_contract() -> None:
    migration = import_module("src.migrations.0113_knowledge_guidance_tables").Migration

    assert migration.dependencies == [("models", "0112_platform_current_mfa_action")]
    assert [operation.name for operation in migration.operations] == [
        "KnowledgeGuidanceLayerRecord",
        "KnowledgeGuidanceRevisionRecord",
        "KnowledgeGuidanceReferenceRecord",
        "KnowledgeGuidancePreviewRecord",
        "KnowledgeGuidanceCommandRecord",
    ]
    assert [operation.options["table"] for operation in migration.operations] == [
        "knowledge_guidance_layers",
        "knowledge_guidance_revisions",
        "knowledge_guidance_references",
        "knowledge_guidance_previews",
        "knowledge_guidance_commands",
    ]

    layer, revision, reference, preview, command = migration.operations
    assert layer.options["unique_together"] == (("workspace_id", "scope_kind", "scope_id"),)
    assert revision.options["unique_together"] == (
        ("guidance_layer_id", "revision_number"),
        ("guidance_layer_id", "request_idempotency_key"),
    )
    assert reference.options["unique_together"] == (("guidance_layer_id", "knowledge_base_id"),)
    assert preview.options["unique_together"] == (("guidance_layer_id", "kind", "request_idempotency_key"),)
    assert command.options["unique_together"] == (("guidance_layer_id", "kind", "request_idempotency_key"),)
