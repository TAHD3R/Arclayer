# Arclayer Local Plugins

Local project plugins live under this directory and are loaded during API startup.

## Directory Contract

Each plugin uses one subdirectory under `plugins/`:

```text
plugins/
  my_plugin/
    __init__.py
```

The `__init__.py` file must expose `create_plugin()`. The factory may return an object or class instance with Arclayer hook implementations:

```python
from src.core.plugin import arclayer_hookimpl


class MyPlugin:
    @arclayer_hookimpl
    def arclayer_register(self, registry):
        registry.services.register("my-plugin.service", object())


def create_plugin():
    return MyPlugin()
```

Startup loads built-in plugins first, then entry point plugins from the `arclayer.plugins` group, then local plugins from this directory in sorted directory-name order. Plugin load or factory errors fail API startup.
