from __future__ import annotations

from typing import Annotated, Literal

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.json_types import JsonValue

LocaleCode = str
LocalizedString = dict[LocaleCode, str]


class DesignBindingExprV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: Literal["binding"] = Field(..., description="Binding expression marker.")
    source: Literal["primaryEntry", "prefabProps", "routeParams", "site", "viewer"] = Field(
        ..., description="Binding source."
    )
    path: str = Field(..., min_length=1, description="Dot path, e.g. 'fields.title' or 'params.slug'.")


class DesignLiteralValueV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: Literal["literal"] = Field(..., description="Literal value marker.")
    value: JsonValue = Field(..., description="JSON literal payload.")


DesignValueV1 = Annotated[
    DesignLiteralValueV1 | DesignBindingExprV1,
    Field(discriminator="kind"),
]


class DesignMotionRefV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    motion_id: str = Field(..., alias="motionId", min_length=1, description="Referenced motion definition id.")


class DesignConstraintsV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    horizontal: Literal["left", "right", "leftRight", "center", "scale"] = Field(
        ..., description="Horizontal constraint."
    )
    vertical: Literal["top", "bottom", "topBottom", "center", "scale"] = Field(..., description="Vertical constraint.")


class DesignConstraintsPartialV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    horizontal: Literal["left", "right", "leftRight", "center", "scale"] | None = Field(
        default=None, description="Horizontal constraint."
    )
    vertical: Literal["top", "bottom", "topBottom", "center", "scale"] | None = Field(
        default=None, description="Vertical constraint."
    )


class DesignAbsoluteRectV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    x: float = Field(..., description="X offset (px).")
    y: float = Field(..., description="Y offset (px).")
    width: float = Field(..., ge=0, description="Width (px).")
    height: float = Field(..., ge=0, description="Height (px).")


class DesignAbsoluteLayoutV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    rect: DesignAbsoluteRectV1 = Field(..., description="Absolute rectangle.")
    constraints: DesignConstraintsPartialV1 | None = Field(default=None, description="Optional constraints (partial).")
    align_x: Literal["start", "center", "end"] | None = Field(default=None, alias="alignX", description="X anchor.")
    align_y: Literal["start", "center", "end"] | None = Field(default=None, alias="alignY", description="Y anchor.")


class DesignAutoLayoutV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    direction: Literal["row", "column"] = Field(..., description="Auto layout direction.")
    gap: float | None = Field(default=None, ge=0, description="Gap (px).")
    padding: float | None = Field(default=None, ge=0, description="Padding (px).")
    align_items: Literal["start", "center", "end", "stretch"] | None = Field(
        default=None, alias="alignItems", description="Cross-axis alignment."
    )
    justify_content: Literal["start", "center", "end", "space-between", "space-around"] | None = Field(
        default=None, alias="justifyContent", description="Main-axis justification."
    )
    wrap: Literal["nowrap", "wrap"] | None = Field(default=None, description="Wrap mode.")


class DesignChildrenLayoutAbsoluteV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    mode: Literal["absolute"] = Field(..., description="Absolute children layout mode.")


class DesignChildrenLayoutAutoV1(DesignAutoLayoutV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    mode: Literal["auto"] = Field(..., description="Auto children layout mode.")


DesignChildrenLayoutV1 = Annotated[
    DesignChildrenLayoutAbsoluteV1 | DesignChildrenLayoutAutoV1,
    Field(discriminator="mode"),
]


class DesignTypographyV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    font_family: str | None = Field(default=None, alias="fontFamily", description="CSS font-family.")
    font_size: float | None = Field(default=None, alias="fontSize", ge=1, description="Font size (px).")
    line_height: float | None = Field(default=None, alias="lineHeight", ge=1, description="Line height (px).")
    letter_spacing: float | None = Field(default=None, alias="letterSpacing", description="Letter spacing.")
    font_weight: float | None = Field(default=None, alias="fontWeight", description="Font weight.")


class DesignStyleV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    color: str | None = Field(default=None, description="Text color.")
    background_color: str | None = Field(default=None, alias="backgroundColor", description="Background color.")
    border_color: str | None = Field(default=None, alias="borderColor", description="Border color.")
    border_style: Literal["solid", "dashed", "dotted"] | None = Field(
        default=None, alias="borderStyle", description="Border style."
    )
    border_width: float | str | None = Field(default=None, alias="borderWidth", description="Border width.")
    border_radius: float | str | None = Field(default=None, alias="borderRadius", description="Border radius.")
    box_shadow: str | None = Field(default=None, alias="boxShadow", description="Box shadow.")
    opacity: float | None = Field(default=None, ge=0, le=1, description="Opacity.")
    typography: DesignTypographyV1 | None = Field(default=None, description="Typography.")


class DesignTransformV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    rotation: float | None = Field(default=None, description="Rotation (deg).")
    scale_x: float | None = Field(default=None, alias="scaleX", description="Scale X.")
    scale_y: float | None = Field(default=None, alias="scaleY", description="Scale Y.")


class DesignLayoutV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    self: DesignAbsoluteLayoutV1 | None = Field(default=None, description="Self layout inside parent.")
    children: DesignChildrenLayoutV1 = Field(..., description="Children layout definition.")
