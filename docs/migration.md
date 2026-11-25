# Migração

Origem: vendor/packages/modules/supervisor, base ThinkIac main 228d3cf2. Referências anteriores preservadas em test/reference e nunca carregadas pelo produto.

Mantidos nome npm, exports, protocolos, fase e caminhos públicos. Fontes .type são compilados para dist; não editar dist manualmente. Comparações estritas, async e execução direta da CLI são verificadas.

Instale por SHA, substitua cópias incorporadas por fachadas dos mesmos subpaths e execute testes do pacote, integração, regressão Lógos e distribuição isolada. Publicação da base e reinício são operações separadas.

Rollback: restaurar a referência e lockfile anteriores ou as implementações incorporadas. Esta migração não exige conversão de dados.
