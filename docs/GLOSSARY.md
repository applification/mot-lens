# Domain terms

**Recorded test:** one API test entry. Its date, result, mileage and defect text are facts
about that entry, not a current diagnosis. Source and historical registration are retained.

**Latest recorded test:** the greatest supplied completed timestamp. Equal timestamps
are an unordered group; conflicting results/readings are explicitly ambiguous. Undated
CVS records remain visible but cannot be ranked as latest.

**Recorded expiry:** expiry supplied on the latest dated passing test group, if unambiguous.
It is separate from the latest test result. No date is calculated from the test date.

**First MOT due:** a supplied due date for a vehicle with no recorded tests. It is not a
recorded passing test or expiry date.

**Observation:** a deterministic pattern with linked test IDs and its comparison basis.
Repeated wording does not establish repair status; a mileage decrease needs checking.

**Sample:** explicitly fictional representative records, never retrieved from DVSA.
**Retrieval time:** when DVSA returned the cached source record.
**Cache age:** elapsed time between retrieval and this report's delivery.
