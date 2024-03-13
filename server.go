package rtgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/assets"
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

		var req map[string]any
		err = json.Unmarshal(reqBytes, &req)
		if wsErr != nil {
			fmt.Println("ws error", errors.Wrap(err, "unmarshal json"))
			return
		}

		subscribed := req["series"].(string)

		if err := sendInitialData(
			ctx,
			g,
			conn,
			subscribed,
		); err != nil {
			err := errors.Wrap(err, "send initial data")
			fmt.Println("error", err.Error())
			_ = wsjson.Write(ctx, conn, map[string]any{
				"error": err.Error(),
			})
			return
		}

		g.Subscribe(subscribed, func(obj any) error {
			if err := wsjson.Write(ctx, conn, obj); err != nil {
				return errors.Wrap(err, "write websocket")
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

func sendInitialData(
	ctx context.Context,
	graph *Graph,
	conn *websocket.Conn,
	subscribed string,
) error {
	rows, err := graph.GetInitialData(subscribed)
	if err != nil {
		return errors.Wrap(err, "get initial data")
	}

	if err := wsjson.Write(ctx, conn, map[string]any{
		"now": time.Now().UnixMilli(),
	}); err != nil {
		return errors.Wrap(err, "write timestamp")
	}

	if err := wsjson.Write(ctx, conn, map[string]any{
		"initial_data": rows,
		"now":          time.Now().UnixMilli(),
	}); err != nil {
		return errors.Wrap(err, "write initial data")
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
