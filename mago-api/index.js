const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const keysPath = path.join(__dirname, "DataBase", "keys.json");

function salvarBanco(banco) {
    fs.writeFileSync(keysPath, JSON.stringify(banco, null, 2));
}

app.get("/", (req, res) => {
    res.json({
        online: true,
        service: "MAGO API",
        message: "API online"
    });
});

app.post("/check-key", (req, res) => {
    try {
        const { key, hwid } = req.body;

        if (!key || !hwid) {
            return res.json({
                valid: false,
                codigo: "DADOS_AUSENTES",
                message: "Key ou HWID ausente."
            });
        }

        const banco = JSON.parse(fs.readFileSync(keysPath, "utf8"));
        const dados = banco[key];

        if (!dados) {
            return res.json({
                valid: false,
                codigo: "KEY_INVALIDA",
                message: "Key inexistente."
            });
        }

        if (dados.tipo !== "LIFE" && dados.expiraEm && Date.now() >= dados.expiraEm) {
            dados.status = "expirada";
            salvarBanco(banco);

            return res.json({
                valid: false,
                codigo: "KEY_EXPIRADA",
                message: "Licença expirada."
            });
        }

        if (dados.status === "expirada") {
            return res.json({
                valid: false,
                codigo: "KEY_EXPIRADA",
                message: "Licença expirada."
            });
        }

        if (!dados.ativada) {
            dados.ativada = true;
            dados.status = "ativa";
            dados.hwid = hwid;
            dados.ativadaEm = Date.now();

            if (dados.tipo === "DIARIA") {
                dados.expiraEm = Date.now() + 24 * 60 * 60 * 1000;
            } else if (dados.tipo === "SEMANAL") {
                dados.expiraEm = Date.now() + 7 * 24 * 60 * 60 * 1000;
            } else if (dados.tipo === "MENSAL") {
                dados.expiraEm = Date.now() + 30 * 24 * 60 * 60 * 1000;
            } else if (dados.tipo === "LIFE") {
                dados.expiraEm = null;
            }

            salvarBanco(banco);

            return res.json({
                valid: true,
                codigo: "KEY_ATIVADA",
                produto: dados.produto,
                tipo: dados.tipo,
                status: dados.status,
                expiraEm: dados.expiraEm,
                message: "Key ativada com sucesso."
            });
        }

        if (dados.hwid !== hwid) {
            return res.json({
                valid: false,
                codigo: "HWID_INVALIDO",
                message: "Licença vinculada a outro computador."
            });
        }

        return res.json({
            valid: true,
            codigo: "OK",
            produto: dados.produto,
            tipo: dados.tipo,
            status: dados.status,
            expiraEm: dados.expiraEm,
            message: "Licença válida."
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            valid: false,
            codigo: "ERRO_INTERNO",
            message: "Erro interno na API."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`MAGO API online na porta ${PORT}`);
});