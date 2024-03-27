package rtgraph

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/assets"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/pkg/errors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"io/fs"
	"net/http"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
	"time"
)

func (g *Graph) setupServer() error {
	r := g.server

	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/index.html")
	})

	r.GET("/favicon.ico", func(c *gin.Context) {
		c.Status(204)
	})

	g.StaticFiles(assets.FS,
		"dygraph.min.js", "application/javascript",
		"dygraph.css", "text/css",

		"graphs.js", "application/javascript",
		"msgpack.min.js", "application/javascript",
	)

	r.GET("/ws", func(c *gin.Context) {
		ctx := c.Request.Context()

		conn, wsErr := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if wsErr != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, wsErr)
			return
		}

		defer func() {
			_ = conn.Close(websocket.StatusInternalError, "Closed unexpectedly")
		}()

		_, reqBytes, err := conn.Read(ctx)
		if wsErr != nil {
			fmt.Println("ws read error", err.Error())
			return
		}
		conn.CloseRead(ctx)

		type reqT struct {
			Series      []string `json:"series"`
			WindowSize  uint64   `json:"windowSize"`
			LastPointMs uint64   `json:"lastPointMs"`
		}

		var req reqT
		err = json.Unmarshal(reqBytes, &req)
		if wsErr != nil {
			fmt.Println("ws error", errors.Wrap(err, "unmarshal json"))
			return
		}

		now := time.Now()
		if err := wsjson.Write(ctx, conn, map[string]any{
			"now": now.UnixMilli(),
		}); err != nil {
			fmt.Println(errors.Wrap(err, "write timestamp"))
			return
		}

		windowSize := time.Duration(req.WindowSize) * time.Millisecond
		start := now.Add(-windowSize)

		g.Subscribe(req.Series, start, req.LastPointMs, func(data *messages.Data) error {
			binmsg, err := data.MarshalMsg(nil)
			if err != nil {
				return errors.Wrap(err, "marshal msg")
			}

			if err := conn.Write(ctx, websocket.MessageBinary, binmsg); err != nil {
				return errors.Wrap(err, "write binary")
			}

			return nil
		})
	})

	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	return nil
}

func (g *Graph) RunServer(address string) error {
	if err := g.server.Run(address); err != nil {
		return errors.Wrap(err, "run")
	}
	return nil
}

func (g *Graph) StaticFiles(fsys fs.FS, files ...string) {
	for i := 0; i < len(files); i += 2 {
		name := files[i]
		ct := files[i+1]
		g.server.GET("/"+name, func(c *gin.Context) {
			header := c.Writer.Header()
			header["Content-Type"] = []string{ct}
			content, err := fs.ReadFile(fsys, name)
			if err != nil {
				c.Status(404)
				return
			}
			_, _ = c.Writer.Write(content)
		})
	}
}
