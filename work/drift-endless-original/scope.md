# Case Scope

## meta
- case_id: drift-endless-original
- created: 2026-10-04T21:00:11+08:00
- operator: local
- project_root: /Users/skyhand/Dev/Source/cocos/GemGame
- primary_skill: reverse-engineering/SKILL.md
- primary_id: R0
- lead_role: lead
- specialist_roles: []
- hint: Offline Sling Drift original endless boost bridge and streaming implementation
- preset: offline-sample

## auth
- status: granted
- basis: own_system
- evidence_of_auth: User explicitly requests reading their previous drift reverse analysis and reproducing its endless mechanics, 2026-10-04
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - /Users/skyhand/Downloads/poki.com.har
  - /Users/skyhand/.codex/attachments/16b1be8e-9f6e-4d4f-8a1f-7040c4238926/pasted-text.txt
- surfaces: []
- activities: []

## out_of_scope
- assets: []
- activities: [dos, phishing_real_users, unrestricted_exfil]

## network_profile
- mode: offline
- notes: |
    offline | lab_only | authorized_target_only | unrestricted_lab
    Change mode only after auth.status = granted.
    Presets: offline-sample | ctf-public | own-system

## deliverables
- report: true
- field_journal: true
- diagrams: true
- timeline: true

## constraints
- timebox: {}
- stealth: low
- data_handling: anonymize

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [ ] out_of_scope reviewed
  - [ ] roles assigned (see skills/ops/role-map.md)

## ops_refs
- skills/ops/scope-contract.md
- skills/ops/evidence-finding-path.md
- skills/ops/role-map.md
- skills/ops/timeline-workitem.md
- skills/ops/IDENTITY.md
