# WaterTrust — Test Cases

Run with `npx hardhat test`. Fill the **Actual** column from your terminal output (✔ = passed).

| ID | Area | Test case | Input / action | Expected outcome | Actual |
|---|---|---|---|---|---|
| TC-01 | Deployment | Initial roles | Deploy contract | Deployer is admin + operator, quorum = 3 | |
| TC-02 | Access control | Non-admin adds site | `addSite` from outsider | Revert `NotAdmin` | |
| TC-03 | Access control | Unregistered device submits reading | `submitReading` from outsider | Revert `NotActiveSensor` | |
| TC-04 | Access control | Non-witness votes | `commitVerdict` from outsider | Revert `NotActiveWitness` | |
| TC-05 | Access control | Non-operator handles incident | `acknowledgeIncident` from outsider | Revert `NotOperator` | |
| TC-06 | Sites | Add site | `addSite("Asmara Borehole 2", …)` | `SiteAdded(2, …)`, thresholds stored | |
| TC-07 | Sites | Invalid thresholds | phMin 8.50 > phMax 6.50 | Revert `InvalidInput` | |
| TC-08 | Sensors | Duplicate sensor | Register same sensor twice | Revert `SensorAlreadyRegistered` | |
| TC-09 | Readings | Safe reading | pH 7.20, 0.80 NTU, 0.35 mg/L | `ReadingSubmitted(safe=true)`, no incident | |
| TC-10 | Readings | Acidic water | pH 5.50 | `WaterAlert`, incident #1 (UnsafeReading, Open) | |
| TC-11 | Readings | Turbid water | 12.00 NTU | `safe=false`, 1 incident | |
| TC-12 | Readings | No disinfectant | Chlorine 0.05 mg/L | `safe=false` | |
| TC-13 | Readings | Revoked sensor | `setSensorActive(false)` then submit | Revert `NotActiveSensor` | |
| TC-14 | Readings | Inactive site | `setSiteActive(false)` then submit | Revert `SiteInactive(1)` | |
| TC-15 | Readings | Invalid data | pH 15.00 / zero data hash | Revert `InvalidInput` | |
| TC-16 | Readings | Audit history | 3 readings | `getSiteReadingIds(1) = [1,2,3]` | |
| TC-17 | Incidents | Full lifecycle | Acknowledge → resolve with report hash | Status Resolved, operator + hash + time stored | |
| TC-18 | Incidents | Skip acknowledgement | Resolve an Open incident | Revert `InvalidIncidentState(Open)` | |
| TC-19 | Incidents | Unknown incident | Acknowledge #99 | Revert `IncidentNotFound(99)` | |
| TC-20 | Witnesses | **Tamper detection** | Sensor: safe; votes 2 unsafe / 1 safe | Consensus Unsafe, `TamperSuspected`, SensorMismatch incident, reputation +1/+1/−1 | |
| TC-21 | Witnesses | Agreement | Sensor safe; 3 safe votes | Consensus Safe, no incident, all +1 | |
| TC-22 | Witnesses | Quorum not met | 2 reveal, 1 hides | Inconclusive, no incident, hider −1 | |
| TC-23 | Witnesses | Cheating on reveal | Wrong salt / changed vote | Revert `BadReveal`; honest reveal succeeds | |
| TC-24 | Witnesses | Copied vote | w2 copies w1's hash | w2 reveal reverts `BadReveal` | |
| TC-25 | Witnesses | Phase timing | Reveal early, finalize early, commit late | `RevealPhaseNotActive`, `RoundNotEnded`, `CommitPhaseClosed` | |
| TC-26 | Witnesses | Double actions | Commit / reveal / finalize twice | `AlreadyCommitted`, `AlreadyRevealed`, `RoundAlreadyFinalized` | |
| TC-27 | Witnesses | Round rules | 5 s phase; 2nd round same reading | `InvalidInput`; `RoundAlreadyExists(1)` | |
| TC-28 | Witnesses | Hash helper | `computeCommitment` vs ethers hash | Equal | |
| TC-29 | Governance | Admin transfer | transfer → outsider accepts → pending accepts | Outsider reverts; new admin set; old admin loses rights | |
| TC-30 | Governance | Quorum config | quorum 0, then 1 | 0 reverts; with 1 witness tamper is detected, quorum snapshotted | |

## Testnet (Sepolia) evidence — from `scripts/demo.js`

| ID | Scenario | Expected | Actual (tx link) |
|---|---|---|---|
| ST-01 | Deploy contract | Contract address on Sepolia Etherscan | |
| ST-02 | Safe reading | `ReadingSubmitted` safe = true | |
| ST-03 | Unsafe reading | `WaterAlert` + `IncidentOpened` | |
| ST-04 | Resolve incident | `IncidentAcknowledged`, `IncidentResolved` | |
| ST-05 | Spoofed sensor + witness round | `RoundFinalized(Unsafe)` + `TamperSuspected` | |
