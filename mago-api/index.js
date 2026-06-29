const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const keysPath = path.join(__dirname, "DataBase", "keys.json");
const usersPath = path.join(__dirname, "DataBase", "users.json");

function carregarJSON(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function salvarJSON(filePath, banco) {
    fs.writeFileSync(filePath, JSON.stringify(banco, null, 2));
}

function validarKeyInterna(key, hwid) {
    const banco = carregarJSON(keysPath);
    const dados = banco[key];

    if (!dados) {
        return {
            valid: false,
            codigo: "KEY_INVALIDA",
            message: "Key inexistente."
        };
    }

    if (dados.tipo !== "LIFE" && dados.expiraEm && Date.now() >= dados.expiraEm) {
        dados.status = "expirada";
        salvarJSON(keysPath, banco);

        return {
            valid: false,
            codigo: "KEY_EXPIRADA",
            message: "Licença expirada."
        };
    }

    if (dados.status === "expirada") {
        return {
            valid: false,
            codigo: "KEY_EXPIRADA",
            message: "Licença expirada."
        };
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

        salvarJSON(keysPath, banco);

        return {
            valid: true,
            codigo: "KEY_ATIVADA",
            produto: dados.produto,
            tipo: dados.tipo,
            status: dados.status,
            expiraEm: dados.expiraEm,
            message: "Key ativada com sucesso."
        };
    }

    if (dados.hwid !== hwid) {
        return {
            valid: false,
            codigo: "HWID_INVALIDO",
            message: "Licença vinculada a outro computador."
        };
    }

    return {
        valid: true,
        codigo: "OK",
        produto: dados.produto,
        tipo: dados.tipo,
        status: dados.status,
        expiraEm: dados.expiraEm,
        message: "Licença válida."
    };
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

        return res.json(validarKeyInterna(key, hwid));

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            valid: false,
            codigo: "ERRO_INTERNO",
            message: "Erro interno na API."
        });
    }
});

app.post("/register", (req, res) => {
    try {
        const { username, password, key, hwid } = req.body;

        if (!username || !password || !key || !hwid) {
            return res.json({
                success: false,
                codigo: "DADOS_AUSENTES",
                message: "Usuário, senha, key ou HWID ausente."
            });
        }

        const users = carregarJSON(usersPath);

        if (users[username]) {
            return res.json({
                success: false,
                codigo: "USUARIO_EXISTE",
                message: "Usuário já existe."
            });
        }

        const validacao = validarKeyInterna(key, hwid);

        if (!validacao.valid) {
            return res.json({
                success: false,
                codigo: validacao.codigo,
                message: validacao.message
            });
        }

        users[username] = {
            username,
            password,
            key,
            hwid,
            criadoEm: Date.now()
        };

        salvarJSON(usersPath, users);

        return res.json({
            success: true,
            codigo: "REGISTRADO",
            message: "Conta registrada com sucesso.",
            produto: validacao.produto,
            tipo: validacao.tipo,
            expiraEm: validacao.expiraEm
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            codigo: "ERRO_INTERNO",
            message: "Erro interno no registro."
        });
    }
});

app.post("/login", (req, res) => {
    try {
        const { username, password, hwid } = req.body;

        if (!username || !password || !hwid) {
            return res.json({
                success: false,
                codigo: "DADOS_AUSENTES",
                message: "Usuário, senha ou HWID ausente."
            });
        }

        const users = carregarJSON(usersPath);
        const user = users[username];

        if (!user) {
            return res.json({
                success: false,
                codigo: "USUARIO_INVALIDO",
                message: "Usuário inexistente."
            });
        }

        if (user.password !== password) {
            return res.json({
                success: false,
                codigo: "SENHA_INVALIDA",
                message: "Senha incorreta."
            });
        }

        if (user.hwid !== hwid) {
            return res.json({
                success: false,
                codigo: "HWID_INVALIDO",
                message: "Conta vinculada a outro computador."
            });
        }

        const validacao = validarKeyInterna(user.key, hwid);

        if (!validacao.valid) {
            return res.json({
                success: false,
                codigo: validacao.codigo,
                message: validacao.message
            });
        }

        return res.json({
            success: true,
            codigo: "LOGIN_OK",
            message: "Login autorizado.",
            produto: validacao.produto,
            tipo: validacao.tipo,
            expiraEm: validacao.expiraEm
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            codigo: "ERRO_INTERNO",
            message: "Erro interno no login."
        });
    }
});

app.post("/admin/add-key", (req, res) => {
    try {
        const { secret, key, produto, tipo } = req.body;

        if (secret !== process.env.ADMIN_SECRET) {
            return res.status(403).json({
                success: false,
                message: "Acesso negado."
            });
        }

        if (!key || !produto || !tipo) {
            return res.json({
                success: false,
                message: "Dados ausentes."
            });
        }

        const banco = carregarJSON(keysPath);

        banco[key] = {
            produto: produto.toUpperCase(),
            tipo: tipo.toUpperCase(),
            status: "nao_ativada",
            ativada: false,
            discordId: null,
            hwid: null,
            criadaEm: Date.now(),
            expiraEm: null
        };

        salvarJSON(keysPath, banco);

        return res.json({
            success: true,
            message: "Key adicionada.",
            key
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            message: "Erro interno."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`MAGO API online na porta ${PORT}`);
});
