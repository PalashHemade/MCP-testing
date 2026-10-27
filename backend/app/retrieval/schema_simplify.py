"""Flattens a Pydantic input model's JSON Schema into a compact
{field: {type, required, description?, values?}} shape for embedding in
the planner's prompt - raw model_json_schema() repeats `title` on every
field, wraps every optional field in `anyOf: [{...}, {"type": "null"}]`,
and pushes enums into a separate `$defs` block the model has to
cross-reference. None of that is needed for Gemini to pick arguments
correctly; stripping it noticeably shrinks the prompt (and therefore
latency/cost) without losing any information the model actually needs.

Full raw JSON Schema is still what GET /api/v1/tools serves to real API
consumers (see app.api.routes.tools) - only the prompt sent to Gemini
uses this simplified form.
"""
from pydantic import BaseModel


def _resolve_type(prop: dict, defs: dict) -> dict:
    if "$ref" in prop:
        ref_name = prop["$ref"].split("/")[-1]
        enum_def = defs.get(ref_name, {})
        if "enum" in enum_def:
            return {"type": "enum", "values": enum_def["enum"]}
        return {"type": enum_def.get("type", "string")}

    if "anyOf" in prop:
        for option in prop["anyOf"]:
            if "$ref" in option:
                resolved = _resolve_type(option, defs)
                return resolved
        for option in prop["anyOf"]:
            if option.get("type") and option["type"] != "null":
                return {"type": option["type"]}
        return {"type": "string"}

    return {"type": prop.get("type", "string")}


def simplify_input_schema(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()
    defs = schema.get("$defs", {})
    required_fields = set(schema.get("required", []))

    simplified: dict = {}
    for field_name, prop in schema.get("properties", {}).items():
        entry = _resolve_type(prop, defs)
        entry["required"] = field_name in required_fields
        description = prop.get("description")
        if description:
            entry["description"] = description
        simplified[field_name] = entry
    return simplified
