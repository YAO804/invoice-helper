package files

import "testing"

func newTestStore(t *testing.T) *Store {
	t.Helper()

	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return store
}
