from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0013_content_platform_rebuild")]

    initial = False

    operations = [
        ops.RemoveField(model_name="RouteTemplateRecord", name="site"),
        ops.RemoveField(model_name="RouteTemplateRecord", name="entry_type"),
        ops.RemoveField(model_name="RouteTemplateRecord", name="template_page_revision"),
        ops.RemoveField(model_name="SitePageRevisionRecord", name="page"),
        ops.RemoveField(model_name="SitePageRecord", name="site"),
        ops.RemoveField(model_name="SitePageRecord", name="parent"),
        ops.RemoveField(model_name="EntryRevisionRecord", name="entry"),
        ops.RemoveField(model_name="EntryRecord", name="site"),
        ops.RemoveField(model_name="EntryRecord", name="entry_type"),
        ops.RemoveField(model_name="EntryTypeRecord", name="site"),
        ops.RemoveField(model_name="ContentTreeNodeRecord", name="workspace"),
        ops.RemoveField(model_name="ContentTreeNodeRecord", name="site"),
        ops.RemoveField(model_name="ContentTreeNodeRecord", name="entry"),
        ops.RemoveField(model_name="ContentTreeNodeRecord", name="parent_entry"),
        ops.RemoveField(model_name="ContentRouteRecord", name="workspace"),
        ops.RemoveField(model_name="ContentRouteRecord", name="site"),
        ops.RemoveField(model_name="ContentRouteRecord", name="entry"),
        ops.RemoveField(model_name="ContentRevisionRecord", name="entry"),
        ops.RemoveField(model_name="ContentEntryRecord", name="workspace"),
        ops.RemoveField(model_name="ContentEntryRecord", name="site"),
        ops.RemoveField(model_name="ContentEntryRecord", name="type"),
        ops.RemoveField(model_name="ContentTypeRecord", name="workspace"),
        ops.RemoveField(model_name="ContentTypeRecord", name="site"),
        ops.DeleteModel(name="RouteTemplateRecord"),
        ops.DeleteModel(name="SitePageRevisionRecord"),
        ops.DeleteModel(name="SitePageRecord"),
        ops.DeleteModel(name="EntryRevisionRecord"),
        ops.DeleteModel(name="EntryRecord"),
        ops.DeleteModel(name="EntryTypeRecord"),
        ops.DeleteModel(name="ContentTreeNodeRecord"),
        ops.DeleteModel(name="ContentRouteRecord"),
        ops.DeleteModel(name="ContentRevisionRecord"),
        ops.DeleteModel(name="ContentEntryRecord"),
        ops.DeleteModel(name="ContentTypeRecord"),
    ]
