package assets

import "embed"

//go:embed rtgraph/*.js
//go:embed rtgraph/dist/*.js
//go:embed rtgraph/*.css rtgraph/purecss/*.css
var FS embed.FS
