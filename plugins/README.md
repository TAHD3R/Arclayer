# Arclayer Extensions

Extensions live under this directory and are loaded during API startup.

## Directory Contract

Each extension uses one subdirectory under `plugins/` with an `extension.json` manifest:

```text
plugins/
  arclayer-core/
    extension.json
    src/
      plugin.py
```

`extension.json` declares the extension name, version, entry point, and capabilities:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "entry": "src/plugin.py",
  "provides": {
    "services": ["my-svc"],
    "content_types": ["my-content-type"]
  }
}
```

`src/plugin.py` must export `create_plugin()`. The factory returns a plugin instance
that implements `arclayer_register(registry)` to register capabilities:

```python
from src.core.registries import PluginRegistry


class MyPlugin:
    def arclayer_register(self, registry: PluginRegistry) -> None:
        registry.services.register("my-svc", MyService())
        registry.content_types.register("my-content-type", {"key": "my-content-type", "fields": []})


def create_plugin():
    return MyPlugin()
```

Capabilities declared in `provides` must be registered in `arclayer_register()`.
Mismatches cause `ExtensionRegistrationError` at startup.
