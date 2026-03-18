from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0013_content_platform_rebuild")]

    initial = False

    operations = [
        ops.RemoveField(model_name="RouteTemplateRecord", name="entry_type"),
        ops.RemoveField(model_name="RouteTemplateRecord", name="template_page_revision"),
        ops.DeleteModel(name="RouteTemplateRecord"),
        ops.RemoveField(model_name="SitePageRevisionRecord", name="page"),
        ops.DeleteModel(name="SitePageRevisionRecord"),
        ops.RemoveField(model_name="SitePageRecord", name="parent"),
        ops.DeleteModel(name="SitePageRecord"),
        ops.RemoveField(model_name="EntryRevisionRecord", name="entry"),
        ops.DeleteModel(name="EntryRevisionRecord"),
        ops.RemoveField(model_name="EntryRecord", name="entry_type"),
        ops.DeleteModel(name="EntryRecord"),
        ops.DeleteModel(name="EntryTypeRecord"),
        ops.RemoveField(model_name="ContentTreeNodeRecord", name="entry"),
        ops.RemoveField(model_name="ContentTreeNodeRecord", name="parent_entry"),
        ops.DeleteModel(name="ContentTreeNodeRecord"),
        ops.RemoveField(model_name="ContentRouteRecord", name="entry"),
        ops.DeleteModel(name="ContentRouteRecord"),
        ops.RemoveField(model_name="ContentRevisionRecord", name="entry"),
        ops.DeleteModel(name="ContentRevisionRecord"),
        ops.RemoveField(model_name="ContentEntryRecord", name="type"),
        ops.DeleteModel(name="ContentEntryRecord"),
        ops.DeleteModel(name="ContentTypeRecord"),
    ]
