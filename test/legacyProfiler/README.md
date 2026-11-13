# Frozen profiler: the reference for profiling results

These modules are a copy of `src/qvdProfiler.mjs` and the modules it calls, as they were
once #157 was fixed: every distinct value is counted, and the distribution shows the most
frequent ones. They profile an array of rows, held in memory.

The extension now profiles a QVD a chunk at a time, keeping counts per distinct value
rather than the rows (`src/fieldProfile.mjs`). `test/profileIdentity.test.js` checks that
its results are identical to these modules' on the test data, number for number.

**Do not edit them** to follow a change in `src/`. They are what "identical" is measured
against. A deliberate change to profiling results is made in `src/`, and the identity test
then says which results differ, and is changed to expect that.
