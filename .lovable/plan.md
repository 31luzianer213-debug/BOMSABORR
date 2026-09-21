# Auditoria e correção completa do Bom Sabor

## Objetivo
Corrigir primeiro as falhas que podem gerar pedido com valor errado, taxa incorreta, duplicidade ou acesso indevido; depois revisar os fluxos e telas completos.

## Correções prioritárias
1. **Pedidos e valores**
   - Recalcular itens, preços, taxa e total no servidor usando o cardápio e as áreas ativas, sem confiar nos valores enviados pela tela ou pela IA.
   - Respeitar horário real, entrega/retirada habilitadas e formas de pagamento habilitadas.
   - Impedir pedido grátis quando a localização foi enviada sem uma área válida e alinhar as regras da tela e do WhatsApp.

2. **WhatsApp e atendente de IA**
   - Tornar o recebimento de mensagens realmente único mesmo quando o provedor repete ou envia duas chamadas juntas.
   - Evitar respostas concorrentes e pedidos duplicados para a mesma conversa.
   - Preservar mensagens que falharam e melhorar retornos de áudio, localização e envio.
   - Validar o pedido extraído pela IA contra o cardápio antes de gravá-lo.

3. **Entregas e motoboys**
   - Restringir despacho, retirada e conclusão às situações válidas do pedido.
   - Impedir conclusão repetida, reatribuição indevida e avisos duplicados ao cliente.
   - Corrigir o cálculo diário para o horário local e reduzir crescimento desnecessário do histórico de localização.

4. **Acesso, painel e dados**
   - Bloquear o painel também pelo papel de administrador, não apenas por estar conectado.
   - Remover criação pública de novas contas administrativas e conferir as permissões do banco.
   - Corrigir conteúdo inseguro na impressão e na exportação de pedidos.
   - Exibir e tratar erros em alterações de produtos, categorias, bairros e motoboys, evitando falhas silenciosas.

5. **Cardápio e experiência no celular**
   - Validar o carrinho salvo antes de usá-lo e atualizar disponibilidade/horário sem depender de recarregar a página.
   - Corrigir endereço versus localização, taxa mostrada, opções indisponíveis e estados vazios/carregando.
   - Revisar botões, campos, diálogos, foco, textos e tamanhos de toque no celular.

## Alterações técnicas
- Criar migração com unicidade para mensagens externas, restrições de estados e índices necessários, preservando os dados existentes.
- Centralizar cálculo e validação de pedidos em funções de servidor reutilizadas pelo site e pelo atendente.
- Aplicar atualizações condicionais no banco para impedir disputas entre administradores, motoboys e webhooks.
- Substituir HTML montado com dados crus por saída escapada na impressão e proteger células exportadas para CSV.

## Validação
- Verificar cardápio, carrinho e fechamento do pedido em celular e desktop.
- Testar acesso administrativo, edição dos cadastros, impressão e exportação.
- Testar despacho, retirada por motoboy, localização, rastreio e conclusão.
- Simular mensagens repetidas e simultâneas do WhatsApp, além de pedidos por texto, áudio e localização.
- Confirmar compilação, registros do navegador, consultas do banco e verificação de segurança sem falhas relevantes.