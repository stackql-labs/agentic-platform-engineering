import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

FIXTURE = json.loads(Path(__file__).resolve().parents[1].joinpath("fixture.json").read_text(encoding="utf-8"))
MAX_APPROVAL_TTL_SECONDS = 300


def create_fixture() -> dict[str, Any]:
    scope = FIXTURE["scope"]
    observed = FIXTURE["observed"]
    return {
        "namespace": scope["namespace"],
        "name": scope["name"],
        "label": dict(scope["label"]),
        "resource_version": observed["resource_version"],
        "image": observed["image"],
        "desired_replicas": observed["desired_replicas"],
        "ready_replicas": observed["ready_replicas"],
        "waiting_reason": observed["waiting_reason"],
        "event": observed["event"],
        "approved_desired_state": dict(FIXTURE["approved_desired_state"]),
        "applied_plans": set(),
        "correlation_id": str(uuid4()),
        "audit": [],
    }


def _digest(value: Any) -> str:
    encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _record(state: dict[str, Any], event: str, decision: str, reason: str, details: dict[str, Any] | None = None) -> None:
    state["audit"].append(
        {
            "correlation_id": state["correlation_id"],
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "event": event,
            "decision": decision,
            "reason": reason,
            "details": details or {},
        }
    )


def record_approval_denial(state: dict[str, Any], plan: dict[str, Any], reason: str) -> None:
    _record(state, "approval", "denied", reason, {"plan_digest": plan["digest"]})

def record_policy_denial(state: dict[str, Any], reason: str) -> None:
    _record(state, "policy_decision", "denied", reason, {"operation": "repair_deployment_image"})


def evidence_id(state: dict[str, Any]) -> str:
    return _digest(
        [
            state["namespace"],
            state["name"],
            state["resource_version"],
            state["image"],
            state["ready_replicas"],
        ]
    )


def dispatch_tool(name: str, arguments: Any, state: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(arguments, dict):
        _record(state, "tool_policy", "denied", "arguments_must_be_object", {"tool": name})
        return {"allowed": False, "terminal": True, "result": {"status": "denied", "reason": "arguments_must_be_object"}}

    if name == "get_inventory" and set(arguments) == {"namespace"} and arguments["namespace"] == "shop":
        _record(state, "evidence_read", "allowed", "scoped_inventory_read", {"evidence_id": evidence_id(state)})
        return {
            "allowed": True,
            "terminal": False,
            "result": {
                "status": "ok",
                "evidence_id": evidence_id(state),
                "inventory": {
                    "namespace": state["namespace"],
                    "name": state["name"],
                    "resource_version": state["resource_version"],
                    "image": state["image"],
                    "desired_replicas": state["desired_replicas"],
                    "ready_replicas": state["ready_replicas"],
                    "waiting_reason": state["waiting_reason"],
                    "event": state["event"],
                },
            },
        }
    if name == "get_desired_state" and set(arguments) == {"name"} and arguments["name"] == "checkout":
        _record(state, "desired_state_read", "allowed", "approved_fixture_baseline", {"name": "checkout"})
        return {"allowed": True, "terminal": False, "result": {"status": "ok", "desired": state["approved_desired_state"]}}
    if (
        name == "propose_image_repair"
        and set(arguments) == {"namespace", "name", "image", "evidence_id"}
        and arguments["namespace"] == "shop"
        and arguments["name"] == "checkout"
        and arguments["image"] == state["approved_desired_state"]["image"]
        and arguments["evidence_id"] == evidence_id(state)
    ):
        plan = plan_image_repair(state, arguments["image"])
        _record(state, "plan_proposed", "approval_required", "exact_image_repair", {"plan_digest": plan["digest"]})
        return {"allowed": True, "terminal": True, "result": {"status": "approval_required", "plan": plan}, "plan": plan}
    _record(state, "tool_policy", "denied", "unknown_tool_or_invalid_arguments", {"tool": name})
    return {
        "allowed": False,
        "terminal": True,
        "result": {"status": "denied", "reason": "unknown_tool_or_invalid_arguments"},
    }


def plan_image_repair(state: dict[str, Any], image: str) -> dict[str, Any]:
    if (
        state["namespace"] != "shop"
        or state["name"] != "checkout"
        or state["label"] != {"key": "purpose", "value": "agentic-demo"}
        or image != state["approved_desired_state"]["image"]
    ):
        raise ValueError("Policy denied: target or image is outside the approved scope.")
    fields = {
        "operation": "repair_deployment_image",
        "namespace": state["namespace"],
        "name": state["name"],
        "expectedResourceVersion": state["resource_version"],
        "expectedImage": state["image"],
        "image": image,
        "evidenceId": evidence_id(state),
    }
    return {**fields, "digest": _digest(fields)}


def issue_approval(plan: dict[str, Any], approver: str, now_ms: int, ttl_seconds: int, nonce: str) -> dict[str, Any]:
    if not isinstance(approver, str) or not approver.strip():
        raise ValueError("Policy denied: approver identity is required.")
    if not isinstance(ttl_seconds, int) or not 1 <= ttl_seconds <= MAX_APPROVAL_TTL_SECONDS:
        raise ValueError("Policy denied: approval expiry must be between 1 and 300 seconds.")
    binding = {
        "approver": approver.strip(),
        "planDigest": plan["digest"],
        "issuedAt": now_ms,
        "expiresAt": now_ms + ttl_seconds * 1000,
        "nonce": nonce,
    }
    return {**binding, "token": _digest(binding)}


def execute_approved_repair(
    state: dict[str, Any],
    plan: dict[str, Any],
    approval: dict[str, Any],
    mode: str,
    now_ms: int,
    verify: bool = True,
) -> dict[str, str]:
    def denied(reason: str) -> dict[str, str]:
        _record(state, "policy_decision", "denied", reason, {"operation": "repair_deployment_image"})
        return {"status": "denied", "reason": reason}

    if mode == "read_only":
        return denied("read_only_identity_cannot_mutate")
    if mode != "safe":
        return {"status": "denied", "reason": "unknown_policy_mode"}
    try:
        canonical = plan_image_repair(state, plan["image"])
    except (KeyError, ValueError):
        return denied("stale_or_altered_plan")
    if canonical["digest"] != plan.get("digest") or plan.get("evidenceId") != evidence_id(state):
        return {"status": "denied", "reason": "stale_or_altered_plan"}
    binding = {key: approval.get(key) for key in ("approver", "planDigest", "issuedAt", "expiresAt", "nonce")}
    if (
        not isinstance(approval.get("approver"), str)
        or not approval["approver"].strip()
        or approval.get("planDigest") != plan["digest"]
        or not isinstance(approval.get("expiresAt"), int)
        or approval["expiresAt"] <= now_ms
        or not isinstance(approval.get("issuedAt"), int)
        or approval["issuedAt"] > now_ms
        or approval["expiresAt"] - approval["issuedAt"] > MAX_APPROVAL_TTL_SECONDS * 1000
        or approval.get("token") != _digest(binding)
    ):
        return denied("missing_expired_or_invalid_approval")
    if plan["digest"] in state["applied_plans"]:
        return denied("duplicate_execution_denied")

    _record(
        state,
        "approval",
        "accepted",
        "exact_plan_approved",
        {
            "plan_digest": plan["digest"],
            "approver": approval["approver"],
            "expires_at": datetime.fromtimestamp(approval["expiresAt"] / 1000, timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
        },
    )
    state["applied_plans"].add(plan["digest"])
    _record(state, "operation", "started", "single_narrow_fixture_change", {"plan_digest": plan["digest"]})
    state["image"] = plan["image"]
    state["resource_version"] = f"fixture-rv-{int(state['resource_version'].split('-')[-1]) + 1}"
    state["ready_replicas"] = state["desired_replicas"]
    state["waiting_reason"] = ""
    state["event"] = "Synthetic fixture: repaired image observed."
    if not verify or state["image"] != state["approved_desired_state"]["image"] or state["ready_replicas"] != state["desired_replicas"]:
        _record(state, "verification", "failed", "post_change_verification_failed", {"plan_digest": plan["digest"]})
        return {"status": "failed", "reason": "post_change_verification_failed"}
    _record(
        state,
        "verification",
        "passed",
        "approved_image_repair_verified",
        {"resource_version": state["resource_version"], "ready_replicas": state["ready_replicas"]},
    )
    return {"status": "verified", "reason": "approved_image_repair_verified"}


def resolve_uncertain_repair(state: dict[str, Any], plan: dict[str, Any]) -> dict[str, str]:
    verified = (
        state["namespace"] == plan["namespace"]
        and state["name"] == plan["name"]
        and state["image"] == plan["image"] == state["approved_desired_state"]["image"]
        and state["ready_replicas"] == state["desired_replicas"]
    )
    result = (
        {"status": "verified", "reason": "uncertain_operation_confirmed_by_fresh_read"}
        if verified
        else {"status": "failed", "reason": "uncertain_operation_not_verified_no_retry"}
    )
    _record(
        state,
        "uncertain_outcome_verification",
        result["status"],
        result["reason"],
        {"plan_digest": plan["digest"], "resource_version": state["resource_version"]},
    )
    return result
