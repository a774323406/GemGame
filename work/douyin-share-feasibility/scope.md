# Case Scope

## meta
- case_id: douyin-share-feasibility
- created: 2026-11-13T17:12:22+08:00
- operator: local
- project_root: /Users/skyhand/Dev/Source/cocos/GemGame
- primary_skill: js-reverse/SKILL.md
- primary_id: R3
- lead_role: lead
- specialist_roles: []
- hint: JS reverse feasibility: public Douyin share landing page only
- preset: none

## auth
- status: granted
- basis: user_request
- evidence_of_auth: User supplied the sharing link and asked whether it can be used to analyze the game. Scope limited to read-only public-page inspection and normal navigation; no active security testing or original-project reconstruction authorized yet.
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - https://m.zjbyte.net/share/douyin/
- surfaces: []
- activities: []

## out_of_scope
- assets: []
- activities: [dos, phishing_real_users, unrestricted_exfil]

## network_profile
- mode: authorized_target_only
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
