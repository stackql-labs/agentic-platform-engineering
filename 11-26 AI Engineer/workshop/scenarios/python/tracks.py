import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

TRACKS = json.loads(Path(__file__).resolve().parents[1].joinpath("tracks.json").read_text(encoding="utf-8"))
MAX_APPROVAL_TTL_SECONDS = 300


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()


def create_track_state() -> dict[str, dict[str, Any]]:
    return {
        key: {
            **value,
            "grants": value.get("grants", []).copy(),
            "approved_grants": value.get("approved_grants", []).copy(),
            "applied_plans": set(),
            "correlation_id": f"fixture-track-{key}-{uuid4()}",
            "audit": [],
        }
        for key, value in TRACKS.items()
    }


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


def track_evidence_id(track: str, state: dict[str, Any]) -> str:
    if track == "finops":
        facts = [track, state.get("resource_id"), state["resource_version"], state.get("current_replicas"), state.get("utilization_percent")]
    elif track == "cspm":
        facts = [track, state.get("resource_id"), state["resource_version"], state.get("public_access")]
    elif track == "access_review":
        facts = [track, state.get("role_binding"), state["resource_version"], state.get("principal"), state.get("grants")]
    else:
        raise ValueError("Policy denied: unknown track.")
    return _digest(facts)


def _build_track_plan(
    track: str, state: dict[str, Any], arguments: dict[str, Any], record_proposal: bool
) -> dict[str, Any]:
    evidence = track_evidence_id(track, state)
    def deny(reason: str) -> None:
        _record(state, "policy_decision", "denied", reason, {"track": track})
        raise ValueError(f"Policy denied: {reason}.")

    if track == "finops":
        if (
            set(arguments) != {"evidence_id", "replicas", "resource_id"}
            or arguments["resource_id"] != "demo-workload-a"
            or arguments["replicas"] != state["approved_replicas"]
            or type(arguments["replicas"]) is not int
            or arguments["replicas"] < state["minimum_replicas"]
            or arguments["evidence_id"] != evidence
        ):
            deny("invalid_finops_target_bounds_or_evidence")
        operation, target, requested = "set_simulated_replica_count", arguments["resource_id"], arguments["replicas"]
    elif track == "cspm":
        if (
            set(arguments) != {"evidence_id", "public_access", "resource_id"}
            or arguments["resource_id"] != "demo-storage"
            or arguments["public_access"] is not False
            or arguments["evidence_id"] != evidence
        ):
            deny("invalid_cspm_target_baseline_or_evidence")
        operation, target, requested = "disable_public_access", arguments["resource_id"], False
    elif track == "access_review":
        if (
            set(arguments) != {"evidence_id", "principal", "remove_permission", "role_binding"}
            or arguments["role_binding"] != "demo-rolebinding"
            or arguments["principal"] != "learner-bot"
            or arguments["remove_permission"] != "delete"
            or "delete" not in state["grants"]
            or "delete" in state["approved_grants"]
            or arguments["evidence_id"] != evidence
        ):
            deny("invalid_access_review_target_permission_or_evidence")
        operation, target, requested = "remove_excess_demo_grant", "demo-rolebinding:learner-bot", "delete"
    else:
        deny("unknown_track")

    fields = {
        "track": track,
        "operation": operation,
        "target": target,
        "expectedResourceVersion": state["resource_version"],
        "requested": requested,
        "evidenceId": evidence,
    }
    plan = {**fields, "digest": _digest(fields)}
    if record_proposal:
        _record(
            state,
            "plan_proposed",
            "approval_required",
            "bounded_track_change",
            {"track": track, "plan_digest": plan["digest"], "evidence_id": evidence},
        )
    return plan


def propose_track_plan(track: str, state: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
    return _build_track_plan(track, state, arguments, True)


def issue_track_approval(plan: dict[str, Any], approver: str, now_ms: int, ttl_seconds: int, nonce: str) -> dict[str, Any]:
    if not approver.strip():
        raise ValueError("Policy denied: approver identity is required.")
    if not isinstance(ttl_seconds, int) or not 1 <= ttl_seconds <= MAX_APPROVAL_TTL_SECONDS:
        raise ValueError("Policy denied: approval expiry must be between 1 and 300 seconds.")
    fields = {
        "approver": approver.strip(),
        "planDigest": plan["digest"],
        "issuedAt": now_ms,
        "expiresAt": now_ms + ttl_seconds * 1000,
        "nonce": nonce,
    }
    return {**fields, "token": _digest(fields)}


def execute_track_plan(
    state: dict[str, Any], plan: dict[str, Any], approval: dict[str, Any], mode: str, now_ms: int
) -> dict[str, str]:
    def denied(reason: str) -> dict[str, str]:
        _record(state, "policy_decision", "denied", reason, {"track": plan.get("track"), "plan_digest": plan.get("digest")})
        return {"status": "denied", "reason": reason}

    if mode == "read_only":
        return denied("read_only_identity_cannot_mutate")
    if mode != "safe":
        return denied("unknown_policy_mode")
    if plan.get("digest") in state["applied_plans"]:
        return denied("duplicate_execution_denied")
    args = {
        "finops": {
            "resource_id": state.get("resource_id"),
            "replicas": plan.get("requested"),
            "evidence_id": track_evidence_id("finops", state),
        },
        "cspm": {
            "resource_id": state.get("resource_id"),
            "public_access": plan.get("requested"),
            "evidence_id": track_evidence_id("cspm", state),
        },
        "access_review": {
            "role_binding": state.get("role_binding"),
            "principal": state.get("principal"),
            "remove_permission": plan.get("requested"),
            "evidence_id": track_evidence_id("access_review", state),
        },
    }
    try:
        canonical = _build_track_plan(plan["track"], state, args[plan["track"]], False)
    except (KeyError, ValueError):
        return {"status": "denied", "reason": "stale_or_altered_plan"}
    if canonical != plan or plan.get("expectedResourceVersion") != state["resource_version"]:
        return denied("stale_or_altered_plan")
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

    _record(state, "approval", "accepted", "exact_plan_approved", {"plan_digest": plan["digest"], "approver": approval["approver"]})
    state["applied_plans"].add(plan["digest"])
    _record(state, "operation", "started", "single_narrow_fixture_change", {"track": plan["track"], "plan_digest": plan["digest"]})
    if plan["track"] == "finops":
        state["current_replicas"] = plan["requested"]
        state["resource_version"] = "fin-rv-5"
        verified = state["current_replicas"] == state["approved_replicas"]
    elif plan["track"] == "cspm":
        state["public_access"] = plan["requested"]
        state["resource_version"] = "cspm-rv-10"
        verified = state["public_access"] == state["approved_public_access"]
    else:
        state["grants"] = [grant for grant in state["grants"] if grant != plan["requested"]]
        state["resource_version"] = "iam-rv-3"
        verified = state["grants"] == state["approved_grants"]
    if not verified:
        _record(state, "verification", "failed", "post_change_verification_failed", {"track": plan["track"]})
        return {"status": "failed", "reason": "post_change_verification_failed"}
    _record(
        state,
        "verification",
        "passed",
        f"{plan['track']}_fixture_change_verified",
        {"track": plan["track"], "resource_version": state["resource_version"]},
    )
    return {"status": "verified", "reason": f"{plan['track']}_fixture_change_verified"}
