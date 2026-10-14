from flask import Flask, jsonify


def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="")

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
