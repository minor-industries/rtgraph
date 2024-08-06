package sqlite

import "crypto/sha256"

func HashedID(s string) []byte {
	var result [16]byte
	h := sha256.New()
	h.Write([]byte(s))
	sum := h.Sum(nil)
	copy(result[:], sum[:16])
	return result[:]
}
