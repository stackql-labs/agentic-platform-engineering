import unittest

from tracks import (
    create_track_state,
    execute_track_plan,
    issue_track_approval,
    propose_track_plan,
    track_evidence_id,
)


class WorkshopTrackTests(unittest.TestCase):
    def test_all_tracks_use_the_same_approval_and_verification_contract(self) -> None:
        states = create_track_state()
        arguments = {
            "finops": lambda state: {
                "resource_id": state["resource_id"],
                "replicas": state["approved_replicas"],
                "evidence_id": track_evidence_id("finops", state),
            },
            "cspm": lambda state: {
                "resource_id": state["resource_id"],
                "public_access": state["approved_public_access"],
                "evidence_id": track_evidence_id("cspm", state),
            },
            "access_review": lambda state: {
                "role_binding": state["role_binding"],
                "principal": state["principal"],
                "remove_permission": "delete",
                "evidence_id": track_evidence_id("access_review", state),
            },
        }
        for track, state in states.items():
            plan = propose_track_plan(track, state, arguments[track](state))
            approval = issue_track_approval(plan, "facilitator", 1000, 300, track)
            self.assertEqual(execute_track_plan(state, plan, approval, "read_only", 2000)["status"], "denied")
            self.assertEqual(execute_track_plan(state, plan, approval, "safe", 2000)["status"], "verified", track)
            self.assertEqual(
                [event["event"] for event in state["audit"]],
                ["plan_proposed", "policy_decision", "approval", "operation", "verification"],
            )

    def test_unsafe_and_stale_track_proposals_are_denied(self) -> None:
        states = create_track_state()
        with self.assertRaisesRegex(ValueError, "Policy denied"):
            propose_track_plan(
                "finops",
                states["finops"],
                {
                    "resource_id": "production-db",
                    "replicas": 1,
                    "evidence_id": track_evidence_id("finops", states["finops"]),
                },
            )
        state = states["cspm"]
        plan = propose_track_plan(
            "cspm",
            state,
            {
                "resource_id": state["resource_id"],
                "public_access": False,
                "evidence_id": track_evidence_id("cspm", state),
            },
        )
        approval = issue_track_approval(plan, "facilitator", 1000, 300, "cspm")
        state["resource_version"] = "cspm-rv-10"
        self.assertEqual(execute_track_plan(state, plan, approval, "safe", 2000)["reason"], "stale_or_altered_plan")

        access = states["access_review"]
        access_plan = propose_track_plan(
            "access_review",
            access,
            {
                "role_binding": access["role_binding"],
                "principal": access["principal"],
                "remove_permission": "delete",
                "evidence_id": track_evidence_id("access_review", access),
            },
        )
        access_approval = issue_track_approval(access_plan, "facilitator", 1000, 300, "access")
        tampered_approval = {**access_approval, "planDigest": "another-plan"}
        self.assertEqual(
            execute_track_plan(access, access_plan, tampered_approval, "safe", 2000)["status"],
            "denied",
        )


if __name__ == "__main__":
    unittest.main()
