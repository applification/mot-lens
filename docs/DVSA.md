# DVSA integration and record accuracy

Checked against the [official API specification](https://documentation.history.mot.api.gov.uk/mot-history-api/api-specification/),
[authentication](https://documentation.history.mot.api.gov.uk/mot-history-api/authentication/),
[registration](https://documentation.history.mot.api.gov.uk/mot-history-api/register/) and
[rate limits](https://documentation.history.mot.api.gov.uk/mot-history-api/rate-limits/) on 9 October 2026.
The live integration remains unverified until issued credentials are available.

The current endpoint is `GET https://history.mot.api.gov.uk/v1/trade/vehicles/registration/{registration}`.
It returns one vehicle object, not the legacy array. The adapter validates the current
vehicle variants, including their required recall marker; recall data is omitted from this
MOT-only report. Optional vehicle details may be absent/null. A newly registered vehicle may
have a first MOT due date and no test history. Empty objects, malformed tests, legacy arrays
and a mismatched returned registration are errors, not empty reports.

DVSA, DVA NI and CVS test entries are retained. NI entries do not supply defect details;
absence is shown as unavailable. CVS records may lack a completed date: they remain visible
without an invented position in dated chronology. The API does not promise a retest flag,
an order from test numbers or proof of repairs. Equal timestamps stay unordered; all records
remain individually selectable, with ambiguous summary values disclosed. The chart breaks
connectors around equal timestamps and missing readings.

Registrations are uppercased with whitespace removed and URL-encoded. Basic input validation
allows older, Northern Ireland and dateless formats, then DVSA decides whether the plate exists.
No registration suggestion service, search database or bulk import is used.

`READ` non-negative numeric MI/KM readings are charted; unreadable, absent, unknown-unit and
no-odometer records are retained in details/table. Conversion is exactly 1 mi = 1.609344 km.
Observations compare adjacent dated, unambiguous reading groups with a tiny floating-point
tolerance. Missing/conflicting readings interrupt the comparison. Decreases link the original
records and ask for checking; they do not establish clocking, diagnosis or a condition verdict.
Repeated advisories match case/whitespace-normalized wording only, deduplicate within a test,
and do not imply repair or persistence from absence in other tests. Original text/type is
preserved, including dangerous flags and unfamiliar categories.

Latest result and latest supplied passing-test expiry are separate facts. An expiry is never
calculated. Conflicting latest passing-test expiries remain unavailable. Dates use supplied
ISO timestamps and UK display time; the local domain fixture also understands legacy dates.

OAuth uses a form-encoded client-credentials POST to the Microsoft Entra URL and scope issued
by DVSA. Tokens are reused until 60 seconds before returned `expires_in`, with single-flight
acquisition. Every lookup sends Bearer authorization and `X-API-Key`. One expired-token renewal
is allowed for 401 or documented `MOTH-FB-02` 403. Other authentication problems are explicit;
temporary token/server failures get bounded retries, 429 gets cooldown/Retry-After. Not-found,
invalid-input and permanent authorization errors are not retried. Network calls time out at 8s.

The official published limit is 500,000 requests/day, average 15/s, burst 10. MOT Lens is much
more conservative: one global coordinator, serial calls spaced at least 350ms, eight queued
lookups, at most three attempts for transient failures. At that pacing continuous lookup
traffic is below 247,000/day. Credentials should be dedicated to this deployment: traffic
outside MOT Lens cannot be coordinated here. 429 is never immediately retried.

Vehicle responses are memory-cached for at most 15 minutes/256 entries, identical simultaneous
queries coalesce, failures are not cached. Retrieval time and actual cache age are shown.
Cloudflare may evict the memory coordinator after idle inactivity, discarding cache/tokens
and cooldowns. A subsequent lookup may re-establish a quota cooldown with one upstream 429.
No persistent storage, database or background timer is used to keep it alive. See hosting limits.

Official data is attributed to DVSA with “Contains public sector information licensed under
the Open Government Licence v3.0.” See the
[DfT MOT dataset licence](https://www.data.gov.uk/dataset/e3939ef8-30c7-4ca8-9c7c-ad9475cc9b2f/anonymised-mot-tests-and-results)
and [OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
The code is separately MIT licensed. Neither DVSA nor OpenAI endorses MOT Lens. The operator
must complete DVSA registration and follow the access conditions supplied with its credentials;
this project cannot verify acceptance or use rights for credentials it has not received.
