# HomeZZ rules

- Agent rosters fill every active agent's four canonical promotion types in registry order, preserving returned values and zero-filling only absent types; inactive agents have none. The non-blocking `details-agency` contract summary reads `contract.promos` and becomes null on failure, while activation, slots, allocation writes and listing promotions stay unchanged. Why: new agents must be configurable before their first allocation without hiding portal refusals or inventing a contract on read failure.
