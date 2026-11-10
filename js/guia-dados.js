// Guia de valores e procedimentos: dado um valor (temperatura, umidade, pressão, UV, vento, direção, chuva), devolve a faixa,
// o que isso significa e o que fazer. Textos em um só lugar para a Defesa Civil poder revisar.
//
// Origem de cada faixa (campo "fonte"), sempre mostrada na tela:
//   "inmet"      critério dos avisos do INMET (chuva em 1 h e 24 h conferida em avisos publicados em avisos.inmet.gov.br)
//   "informado"  limiar informado pela Defesa Civil de Cajamar, SEM fonte técnica verificada e não homologado
//   "oms"        escala do Índice UV da OMS
//   "beaufort"   escala de Beaufort (limites aproximados, em km/h)
//   "referencia" referência geral de conforto/meteorologia: NÃO é limiar oficial e não foi homologada pela Defesa Civil de Cajamar
// Nada aqui é decisão oficial: aviso, evacuação e interdição são da Defesa Civil e do INMET.
(function (w) {
  "use strict";

  var FONTES = {
    inmet: "Critério dos avisos do INMET (conferido em avisos publicados em avisos.inmet.gov.br)",
    informado: "Limiar informado pela Defesa Civil de Cajamar: sem fonte técnica verificada e não homologado",
    oms: "Escala do Índice UV da OMS",
    beaufort: "Escala de Beaufort (limites aproximados)",
    referencia: "Referência geral, não é limiar oficial nem homologado pela Defesa Civil de Cajamar"
  };

  var AVISO_GERAL = "Orientação geral de saúde e proteção civil. Aviso, evacuação e interdição são decididos pela Defesa Civil e pelo INMET. Emergência: 199 (Defesa Civil), 193 (Bombeiros), 192 (SAMU).";

  // tom: 0 = sem alerta, 1 = atenção, 2 = alerta, 3 = grave (só para a cor na tela)
  var ELEMENTOS = {
    temperatura: {
      titulo: "Temperatura do ar", unidade: "°C", icone: "🌡️", min: -20, max: 60, passo: 0.1,
      explica: "Mede o quanto o ar está quente ou frio. Comanda os outros elementos: ar quente sobe e favorece baixa pressão; ar frio desce e favorece alta pressão.",
      bandas: [
        { de: -Infinity, nome: "Frio", tom: 1, fonte: "referencia", faixa: "abaixo de 15 °C",
          efeitos: "O corpo reduz o sangue nas mãos e nos pés e treme para gerar calor. Aumenta o esforço do coração. Hipotermia pode ocorrer mesmo acima de 0 °C, principalmente com roupa molhada e vento, em idosos, crianças e pessoas em situação de rua.",
          procedimentos: ["Agasalhe-se em camadas e proteja mãos, pés e cabeça.", "Mantenha-se seco: roupa molhada tira calor do corpo.", "Atenção redobrada a idosos, crianças, bebês e pessoas em situação de rua.", "Não use brasa ou fogareiro em ambiente fechado: risco de intoxicação por monóxido de carbono."] },
        { de: 15, nome: "Fresco", tom: 0, fonte: "referencia", faixa: "15 a 18 °C (faixa de transição)",
          efeitos: "Zona de transição entre o frio e o conforto.", procedimentos: ["Leve um agasalho, principalmente à noite e de manhã cedo."] },
        { de: 18, nome: "Conforto", tom: 0, fonte: "referencia", faixa: "18 a 24 °C",
          efeitos: "Zona de menor estresse térmico para a maioria das pessoas. O conforto também depende da umidade, do vento e da roupa.", procedimentos: ["Sem procedimento especial."] },
        { de: 24, nome: "Morno a quente", tom: 0, fonte: "referencia", faixa: "24 a 30 °C (faixa de transição)",
          efeitos: "Zona de transição entre o conforto e o calor.", procedimentos: ["Use roupas leves e beba água ao longo do dia."] },
        { de: 30, nome: "Calor", tom: 1, fonte: "referencia", faixa: "30 a 36 °C",
          efeitos: "O corpo precisa suar para se resfriar. Com esforço ou pouca água, surgem cansaço, dor de cabeça e desidratação.",
          procedimentos: ["Beba água sem esperar a sede.", "Evite esforço físico e sol direto entre 10h e 16h.", "Use roupas leves e chapéu.", "Nunca deixe crianças ou animais dentro de carro fechado.", "Atenção a idosos, crianças e pessoas com doenças crônicas."] },
        { de: 36, nome: "Calor intenso", tom: 2, fonte: "referencia", faixa: "36 °C ou mais",
          efeitos: "Risco de desidratação, queda de pressão, insolação e exaustão pelo calor. Na natureza, favorece a seca e os incêndios, principalmente com ar seco.",
          procedimentos: ["Reduza as atividades ao ar livre e fique em local ventilado ou com sombra.", "Beba água com frequência e molhe a pele e a nuca.", "Sinais de alerta: confusão, tontura, desmaio, pele quente e seca, muita fraqueza. Ligue 192 (SAMU) e resfrie a pessoa na sombra enquanto espera.", "Cuide de idosos, crianças e pessoas que vivem sozinhas."] }
      ],
      nota: "Os limites de temperatura vêm de uma referência geral de conforto. O INMET emite aviso de onda de calor e de declínio de temperatura com critério próprio; o aviso oficial vale mais que esta tabela."
    },

    umidade: {
      titulo: "Umidade relativa do ar", unidade: "%", icone: "💧", min: 0, max: 100, passo: 1,
      explica: "Quanto vapor de água o ar tem em relação ao máximo que ele consegue reter naquela temperatura. É o combustível das tempestades e também reduz a evaporação do suor.",
      bandas: [
        { de: -Infinity, nome: "Emergência (ar muito seco)", tom: 3, fonte: "inmet", faixa: "abaixo de 12%",
          efeitos: "Ar extremamente seco: ressecamento da garganta, do nariz e dos olhos, sangramento nasal, crises de asma e risco muito alto de incêndio.",
          procedimentos: ["Beba bastante água e evite esforço entre 10h e 16h.", "Umidifique o ambiente (bacia com água, toalha molhada) e use soro fisiológico no nariz e nos olhos.", "PROIBIDO fazer queimadas ou soltar balões. Em fumaça ou fogo na vegetação, ligue 193 (Bombeiros).", "Cuidado com crianças, idosos, asmáticos e pessoas com doenças respiratórias."] },
        { de: 12, nome: "Alerta (ar seco)", tom: 2, fonte: "inmet", faixa: "12 a 20%",
          efeitos: "Ar muito seco: desconforto respiratório e nos olhos, maior risco de incêndio na vegetação.",
          procedimentos: ["Beba água com frequência e umidifique os ambientes.", "Evite exercício intenso nas horas mais secas do dia.", "Não faça queimadas nem solte balões; avise o 193 (Bombeiros) em caso de fogo."] },
        { de: 20, nome: "Atenção (ar seco)", tom: 1, fonte: "inmet", faixa: "20 a 30%",
          efeitos: "Ar seco: ressecamento das vias respiratórias e da pele, mais facilidade para fogo na vegetação.",
          procedimentos: ["Beba mais água e hidrate a pele.", "Umidifique os ambientes, principalmente onde há crianças e idosos.", "Evite queimadas."] },
        { de: 30, nome: "Aceitável", tom: 0, fonte: "referencia", faixa: "30 a 50%",
          efeitos: "Abaixo da faixa citada como ideal, sem efeito relevante para a maioria das pessoas.", procedimentos: ["Sem procedimento especial."] },
        { de: 50, nome: "Ideal (referência)", tom: 0, fonte: "referencia", faixa: "50 a 60%",
          efeitos: "Faixa frequentemente citada como confortável. As fontes divergem sobre o intervalo exato; não é padrão oficial.", procedimentos: ["Sem procedimento especial."] },
        { de: 60.0001, nome: "Úmido", tom: 0, fonte: "referencia", faixa: "60 a 80%",
          efeitos: "Ar úmido: o suor evapora mais devagar e a sensação de calor aumenta.", procedimentos: ["Ventile os ambientes.", "Em dia quente, beba água e evite esforço."] },
        { de: 80.0001, nome: "Muito úmido", tom: 1, fonte: "referencia", faixa: "acima de 80%",
          efeitos: "Ar próximo da saturação. Em ambiente fechado favorece mofo, bolor e ácaros (alergias). Umidade alta, por si só, não indica que vai chover.",
          procedimentos: ["Ventile e seque os ambientes para evitar mofo.", "Com calor junto, a sensação de abafamento é maior: beba água e descanse na sombra.", "Para chuva, acompanhe radar e avisos do INMET."] }
      ],
      nota: "A escala abaixo de 30% é a usada nos avisos de baixa umidade do INMET e pela Defesa Civil (a atribuição à OMS aparece em fontes secundárias). As faixas acima de 30% são referência geral."
    },

    pressao: {
      titulo: "Pressão atmosférica", unidade: "hPa", icone: "🧭", min: 300, max: 1100, passo: 0.1, usaAltitude: true,
      explica: "O “peso” do ar sobre o local. O ar se move da alta pressão para a baixa, por isso a pressão comanda os ventos. Mais útil do que o valor isolado é a TENDÊNCIA: queda contínua por horas costuma indicar tempo mudando.",
      bandas: [
        { de: -Infinity, nome: "Baixa pressão (instabilidade)", tom: 1, fonte: "referencia", faixa: "abaixo de 1008 hPa (nível do mar)",
          efeitos: "O ar sobe e leva umidade: nuvens carregadas, vento e pancadas de chuva ficam mais prováveis. Quedas bruscas podem coincidir com dor de cabeça em algumas pessoas, mas a evidência científica é limitada.",
          procedimentos: ["Acompanhe a previsão e os avisos do INMET e o radar.", "Se a pressão cair continuamente por horas junto com nuvens carregadas e vento, fique atento a temporal.", "Recolha objetos soltos e evite áreas de risco se o tempo fechar."] },
        { de: 1008, nome: "Normal", tom: 0, fonte: "referencia", faixa: "1008 a 1020 hPa (nível do mar; padrão 1013,25)",
          efeitos: "Faixa usual ao nível do mar.", procedimentos: ["Sem procedimento especial."] },
        { de: 1020.0001, nome: "Alta pressão (estabilidade)", tom: 0, fonte: "referencia", faixa: "acima de 1020 hPa (nível do mar)",
          efeitos: "O ar desce e evita nuvens: tempo mais firme. Também pode prender a poluição e a fumaça perto do chão, e o ar tende a ficar mais seco.",
          procedimentos: ["Fique atento à baixa umidade e a queimadas.", "Em dias secos e parados, a qualidade do ar pode piorar: veja o índice de qualidade do ar do painel."] }
      ],
      nota: "O equipamento mede a pressão NA ALTITUDE dele, não ao nível do mar. Em Cajamar (altitude de cerca de 735 a 760 m, segundo fontes diferentes) a leitura normal fica perto de 925 a 945 hPa, e não 1013. Por isso o site só aplica as faixas acima depois de converter para o nível do mar com a altitude informada (conversão aproximada, atmosfera padrão)."
    },

    uv: {
      titulo: "Índice UV (radiação ultravioleta)", unidade: "", icone: "☀️", min: 0, max: 20, passo: 1,
      explica: "Mede a parte da radiação solar que queima a pele e os olhos. É diferente da radiação solar em W/m², que mede a energia total do Sol.",
      bandas: [
        { de: -Infinity, nome: "Baixo", tom: 0, fonte: "oms", faixa: "0 a 2",
          efeitos: "Risco baixo para a maioria das pessoas.", procedimentos: ["Sem proteção especial; óculos de sol em dia claro. Se ficar mais de 1 hora ao sol, cubra-se e use protetor."] },
        { de: 2.5, nome: "Moderado", tom: 1, fonte: "oms", faixa: "3 a 5",
          efeitos: "A pele sem proteção pode queimar com exposição prolongada.", procedimentos: ["Use protetor solar, chapéu e óculos de sol.", "Procure sombra ao redor do meio-dia."] },
        { de: 5.5, nome: "Alto", tom: 2, fonte: "oms", faixa: "6 a 7",
          efeitos: "Risco alto de queimadura e de dano aos olhos sem proteção.", procedimentos: ["Reduza o tempo ao sol entre 10h e 16h.", "Use protetor solar, camisa de manga, chapéu e óculos com proteção UV.", "Fique na sombra sempre que possível."] },
        { de: 7.5, nome: "Muito alto", tom: 2, fonte: "oms", faixa: "8 a 10",
          efeitos: "Queimaduras podem ocorrer em poucos minutos para pele sem proteção.", procedimentos: ["Evite o sol entre 10h e 16h.", "Proteção extra: protetor, chapéu, roupa que cubra e óculos com proteção UV.", "Priorize a sombra."] },
        { de: 10.5, nome: "Extremo", tom: 3, fonte: "oms", faixa: "11 ou mais",
          efeitos: "Risco extremo: a pele sem proteção queima em poucos minutos e os olhos podem sofrer lesões.", procedimentos: ["Evite a exposição ao sol, principalmente entre 10h e 16h.", "Se precisar sair, use todas as proteções: protetor, chapéu, roupa que cubra, óculos com proteção UV e sombra."] }
      ],
      nota: "O índice UV é divulgado em número inteiro (2,6 vira 3), como no restante do site. Falta de sol por muito tempo pode reduzir a vitamina D; exposição sem proteção aumenta o risco de câncer de pele."
    },

    radiacao: {
      titulo: "Radiação solar", unidade: "W/m²", icone: "🔆", min: 0, max: 2000, passo: 1,
      explica: "Potência da luz e do calor do Sol que chega a cada metro quadrado. É a fonte de energia do clima: aquece o ar, evapora a água e move o vento. Nuvens e fumaça diminuem o valor.",
      bandas: [
        { de: -Infinity, nome: "Sem Sol ou muito pouco", tom: 0, fonte: "referencia", faixa: "até 100 W/m² (referência descritiva)",
          efeitos: "Noite, céu muito encoberto ou Sol muito baixo.", procedimentos: ["Sem procedimento especial."] },
        { de: 100.0001, nome: "Sol presente", tom: 0, fonte: "referencia", faixa: "acima de 100 a 1361 W/m²",
          efeitos: "Sol com intensidade variável conforme a hora e as nuvens. Em dia de céu limpo, perto do meio-dia, valores em torno de 1000 W/m² são comuns. O risco para a pele depende do índice UV, não deste valor.",
          procedimentos: ["Para proteção da pele, consulte o índice UV.", "O Sol forte também aquece superfícies e o interior de veículos: cuidado com crianças e animais."] },
        { de: 1361.0001, nome: "Acima da constante solar", tom: 1, fonte: "referencia", faixa: "acima de 1361 W/m²",
          efeitos: "Passa da energia que chega ao topo da atmosfera (cerca de 1361 W/m²). Só acontece por instantes, com reflexo de nuvens, ou indica erro do sensor.",
          procedimentos: ["Confira o sensor e os dados antes de usar esse valor."] }
      ],
      nota: "Não há limiares oficiais de W/m² para risco à saúde; por isso o guia só descreve o valor. A faixa de 100 W/m² é descritiva, não oficial."
    },

    vento: {
      titulo: "Velocidade do vento", unidade: "km/h", icone: "💨", min: 0, max: 250, passo: 0.1, usaTemp: true,
      explica: "Velocidade com que o ar se move na horizontal. Distribui calor e umidade pelo planeta. O INMET baseia os avisos de vendaval em rajadas: informe a rajada quando tiver.",
      bandas: [
        { de: -Infinity, nome: "Calmaria (Beaufort 0)", tom: 0, fonte: "beaufort", faixa: "menos de 1 km/h",
          efeitos: "Ar parado: fumaça e poluição se acumulam, e o calor local aumenta.", procedimentos: ["Sem procedimento especial. Com fumaça ou ar seco, atenção à qualidade do ar."] },
        { de: 1, nome: "Brisa fraca (Beaufort 1 a 3)", tom: 0, fonte: "beaufort", faixa: "1 a 19 km/h",
          efeitos: "Folhas se mexem e o vento é perceptível.", procedimentos: ["Sem procedimento especial."] },
        { de: 20, nome: "Brisa moderada a forte (Beaufort 4 e 5)", tom: 0, fonte: "beaufort", faixa: "20 a 38 km/h",
          efeitos: "Levanta poeira e papéis; balança galhos pequenos.", procedimentos: ["Prenda objetos leves."] },
        { de: 39, nome: "Vento forte (Beaufort 6 e 7)", tom: 1, fonte: "beaufort", faixa: "39 a 61 km/h",
          efeitos: "Galhos grandes se movem, guarda-chuvas quebram e andar contra o vento exige esforço. Segundo reportagens que citam o INMET, ventos de 40 a 60 km/h entram em aviso amarelo de vendaval.",
          procedimentos: ["Recolha ou prenda vasos, lonas, toldos e objetos soltos.", "Evite ficar sob árvores, andaimes e placas.", "Dirigir veículos altos ou com carga exige cuidado."] },
        { de: 62, nome: "Ventania (Beaufort 8 e 9)", tom: 2, fonte: "beaufort", faixa: "62 a 88 km/h",
          efeitos: "Quebra galhos e pode danificar telhados. Segundo reportagens que citam o INMET, ventos de 60 a 100 km/h entram em aviso laranja de vendaval, com risco de queda de árvores, destelhamentos e falta de energia.",
          procedimentos: ["Fique em local fechado e longe de janelas, árvores, postes e fios.", "Não se abrigue sob árvores nem ao lado de muros e telhados frágeis.", "Se houver fio caído, não toque e avise a Defesa Civil (199) e a concessionária de energia.", "Evite sair de carro e andar a pé."] },
        { de: 89, nome: "Tempestade (Beaufort 10 e 11)", tom: 3, fonte: "beaufort", faixa: "89 a 117 km/h",
          efeitos: "Danos estruturais, queda de árvores e de redes elétricas.", procedimentos: ["Procure abrigo resistente e fique longe de janelas.", "Não saia até o vento diminuir.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."] },
        { de: 118, nome: "Força de furacão (Beaufort 12)", tom: 3, fonte: "beaufort", faixa: "118 km/h ou mais",
          efeitos: "Devastação.", procedimentos: ["Siga as orientações da Defesa Civil e procure abrigo seguro.", "Em emergência, ligue 199 ou 193."] }
      ],
      nota: "Limites de Beaufort em km/h são aproximados. O vento forte também aumenta a sensação de frio (sensação térmica pelo vento, calculada abaixo quando a temperatura é de 10 °C ou menos)."
    },

    direcao: {
      titulo: "Direção do vento", unidade: "°", icone: "🧭", min: 0, max: 360, passo: 1,
      explica: "É de onde o vento VEM (vento de sul = vem do sul e sopra para o norte). Em graus: 0 ou 360 = norte, 90 = leste, 180 = sul, 270 = oeste. Não existe direção “alta” ou “baixa”: o que importa é a origem.",
      bandas: [
        { de: -Infinity, nome: "Quadrante Norte (NO a NE)", tom: 0, fonte: "referencia", faixa: "315° a 45°",
          efeitos: "No Sudeste do Brasil costuma trazer ar mais quente e seco do interior do continente, ou mais úmido antes da chegada de uma frente fria.", procedimentos: ["Fique atento à temperatura e à umidade.", "Se o vento virar para o sul e esfriar de repente, pode ser a passagem de uma frente fria."] },
        { de: 45, nome: "Quadrante Leste (NE a SE)", tom: 0, fonte: "referencia", faixa: "45° a 135°",
          efeitos: "No Sudeste costuma trazer ar úmido vindo do oceano.", procedimentos: ["Sem procedimento especial."] },
        { de: 135, nome: "Quadrante Sul (SE a SO)", tom: 0, fonte: "referencia", faixa: "135° a 225°",
          efeitos: "No Sudeste, com a passagem de frente fria, o vento tende a virar para o sul e a temperatura cai, às vezes com chuva e rajadas. Quedas de vários graus em poucas horas podem ocorrer.", procedimentos: ["Se o vento virou para o sul e a temperatura está caindo, acompanhe o radar e os avisos do INMET.", "Agasalhe-se."] },
        { de: 225, nome: "Quadrante Oeste (SO a NO)", tom: 0, fonte: "referencia", faixa: "225° a 315°",
          efeitos: "Costuma ser vento do interior; pode trazer ar seco ou instabilidade, conforme a situação.", procedimentos: ["Acompanhe a previsão do dia."] }
      ],
      nota: "As relações regionais são regras gerais para o Sudeste do Brasil e não substituem a previsão. A direção importa muito em incêndios e fumaça: a fumaça vai para o lado para onde o vento sopra."
    },

    chuva: {
      titulo: "Chuva acumulada", unidade: "mm", icone: "🌧️", min: 0, max: 500, passo: 0.1, janelas: true,
      explica: "Volume de água por metro quadrado: 1 mm = 1 litro por m². Os avisos de chuva intensa do INMET usam 1 hora e 24 horas. Acumulados maiores (72 h, 7 dias) medem o encharcamento do solo, mas o limiar de risco é diferente em cada município.",
      bandas: [],
      bandasPorJanela: {
        "1h": [
          { de: -Infinity, nome: "Abaixo dos critérios do INMET", tom: 0, fonte: "inmet", faixa: "menos de 20 mm em 1 hora",
            efeitos: "Abaixo do volume que o INMET usa nos avisos de chuva intensa. Chuva fraca a forte ainda pode causar transtornos pontuais.", procedimentos: ["Acompanhe a chuva e os avisos."] },
          { de: 20, nome: "Amarelo — perigo potencial", tom: 1, fonte: "inmet", faixa: "20 a 30 mm em 1 hora",
            efeitos: "Chuva forte. Risco baixo de alagamentos pontuais e queda de galhos.", procedimentos: ["Evite áreas de alagamento.", "Não atravesse enchente a pé ou de carro.", "Afaste-se de árvores, postes e fios caídos."] },
          { de: 30, nome: "Laranja — perigo", tom: 2, fonte: "inmet", faixa: "30 a 60 mm em 1 hora",
            efeitos: "Chuva intensa. Alto risco de enxurradas, alagamentos e deslizamentos.", procedimentos: ["Evite sair; não atravesse áreas alagadas.", "Afaste-se de encostas, córregos e margens de rio.", "Se notar rachaduras, estalos, lama ou movimento do terreno, saia do local e ligue 199 (Defesa Civil).", "Evacuação e interdição só por decisão da Defesa Civil."] },
          { de: 60.0001, nome: "Vermelho — grande perigo", tom: 3, fonte: "inmet", faixa: "mais de 60 mm em 1 hora",
            efeitos: "Chuva extrema. Grande potencial de inundações e transbordamento de rios.", procedimentos: ["Procure abrigo seguro em local alto e não passe por áreas alagadas.", "Siga a orientação da Defesa Civil.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."] }
        ],
        "24h": [
          { de: -Infinity, nome: "Até 50 mm — faixa amarela do INMET ou abaixo", tom: 0, fonte: "inmet", faixa: "até 50 mm em 24 horas",
            efeitos: "O INMET descreve o amarelo com “até 50 mm/dia”. Valores baixos ainda não geram aviso por si só; o aviso só vale se o INMET o emitir.", procedimentos: ["Acompanhe a chuva e os avisos.", "Evite áreas de alagamento."] },
          { de: 50.0001, nome: "Laranja — perigo", tom: 2, fonte: "inmet", faixa: "50 a 100 mm em 24 horas",
            efeitos: "Chuva intensa, com risco de alagamentos, transbordamento de pequenos córregos e deslizamentos em encostas.", procedimentos: ["Evite sair; não atravesse áreas alagadas.", "Afaste-se de encostas e córregos.", "Se notar rachaduras, estalos ou lama, saia do local e ligue 199.", "Evacuação e interdição só por decisão da Defesa Civil."] },
          { de: 100.0001, nome: "Vermelho — grande perigo", tom: 3, fonte: "inmet", faixa: "mais de 100 mm em 24 horas",
            efeitos: "Chuva extrema, com grande potencial de enchentes e deslizamentos.", procedimentos: ["Procure abrigo seguro em local alto.", "Siga a orientação da Defesa Civil.", "Em emergência, ligue 199 ou 193."] }
        ],
        "72h": [
          { de: -Infinity, nome: "Abaixo do limiar de atenção informado", tom: 0, fonte: "informado", faixa: "menos de 80 mm em 72 horas",
            efeitos: "Abaixo do primeiro limiar informado para 72 horas.", procedimentos: ["Acompanhe a chuva e os avisos."] },
          { de: 80, nome: "Observação / Atenção (amarelo)", tom: 1, fonte: "informado", faixa: "80 a 120 mm em 72 horas",
            efeitos: "O solo começa a ficar saturado. Atenção em encostas e no nível dos rios.", procedimentos: ["Monitore encostas e o nível dos rios.", "Observe trincas, estalos, lama ou água barrenta saindo do barranco.", "Acompanhe os avisos da Defesa Civil e do INMET."] },
          { de: 120, nome: "Alerta (laranja)", tom: 2, fonte: "informado", faixa: "120 a 200 mm em 72 horas",
            efeitos: "Solo encharcado: alto risco de deslizamentos, queda de muros e transbordamento de rios.", procedimentos: ["Afaste-se de encostas, barrancos e margens de rio.", "Se notar rachaduras, estalos, lama ou movimento do terreno, saia do local e ligue 199 (Defesa Civil).", "Evacuação e interdição só por decisão da Defesa Civil."] },
          { de: 200.0001, nome: "Alerta máximo (vermelho)", tom: 3, fonte: "informado", faixa: "mais de 200 mm em 72 horas",
            efeitos: "Saturação crítica do terreno: risco iminente de deslizamentos generalizados, enxurradas e grandes inundações.", procedimentos: ["Procure abrigo seguro em local alto e longe de encostas e rios.", "Siga a orientação da Defesa Civil.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."] }
        ],
        "168h": [
          { de: -Infinity, nome: "Abaixo do limiar de atenção informado", tom: 0, fonte: "informado", faixa: "menos de 120 mm em 7 dias",
            efeitos: "Abaixo do primeiro limiar informado para 7 dias.", procedimentos: ["Acompanhe a chuva e os avisos."] },
          { de: 120, nome: "Observação / Atenção (amarelo)", tom: 1, fonte: "informado", faixa: "120 a 180 mm em 7 dias",
            efeitos: "Solo bastante úmido. Atenção em encostas, barrancos e na subida gradual dos rios.", procedimentos: ["Monitore encostas, barrancos e o nível dos rios.", "Observe trincas, estalos, lama ou água barrenta saindo do barranco.", "Acompanhe os avisos da Defesa Civil e do INMET."] },
          { de: 180, nome: "Alerta (laranja)", tom: 2, fonte: "informado", faixa: "180 a 250 mm em 7 dias",
            efeitos: "Solo saturado: alto risco de deslizamentos, queda de muros, erosão e cheia de rios principais.", procedimentos: ["Afaste-se de encostas, barrancos e margens de rio.", "Se notar rachaduras, estalos, lama ou movimento do terreno, saia do local e ligue 199 (Defesa Civil).", "Evacuação e interdição só por decisão da Defesa Civil."] },
          { de: 250.0001, nome: "Alerta máximo (vermelho)", tom: 3, fonte: "informado", faixa: "mais de 250 mm em 7 dias",
            efeitos: "Encharcamento extremo do terreno: risco iminente de deslizamentos graves e inundações extensas.", procedimentos: ["Procure abrigo seguro em local alto e longe de encostas e rios.", "Siga a orientação da Defesa Civil.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."] }
        ]
      },
      escalaPorJanela: {
        "1h": [{ de: -Infinity, nome: "Chuva fraca" }, { de: 5, nome: "Chuva moderada" }, { de: 20, nome: "Chuva forte" }, { de: 60.0001, nome: "Chuva muito forte ou torrencial" }],
        "24h": [{ de: -Infinity, nome: "Chuva fraca" }, { de: 5, nome: "Chuva moderada" }, { de: 25, nome: "Chuva forte" }, { de: 50.0001, nome: "Chuva muito forte ou extrema (crítica acima de 100 mm)" }],
        "72h": [{ de: -Infinity, nome: "Acumulado baixo" }, { de: 30, nome: "Acumulado moderado" }, { de: 80, nome: "Acumulado elevado" }, { de: 150.0001, nome: "Acumulado crítico ou extremo" }],
        "168h": [{ de: -Infinity, nome: "Acumulado baixo" }, { de: 50, nome: "Acumulado moderado" }, { de: 120, nome: "Acumulado elevado" }, { de: 200.0001, nome: "Acumulado crítico ou extremo" }]
      },
      nota: "Chuva em 1 h e 24 h: critério dos avisos do INMET (o aviso só vale quando o INMET o emite). Chuva em 72 h e 7 dias: limiares informados pela Defesa Civil de Cajamar, SEM fonte técnica verificada e não homologados; o Cemaden usa limiares próprios por município (por exemplo, cerca de 100 mm em 72 h para Campos do Jordão e cerca de 60 mm em outras regiões), então valide estes números antes de usá-los como critério de decisão. A escala de intensidade (fraca, moderada, forte) também é informada e varia por fonte. Veja também o indicador referencial (não homologado) no painel."
    }
  };

  function ok(v) { return typeof v === "number" && isFinite(v); }

  function achar(bandas, v) {
    var r = null;
    for (var i = 0; i < bandas.length; i++) if (v >= bandas[i].de) r = bandas[i];
    return r;
  }

  // Pressão da estação (altitude h, em m) para o nível do mar: atmosfera padrão, aproximação.
  function pressaoNivelDoMar(p, h) {
    if (!ok(p) || !ok(h) || h < -400 || h > 5000) return null;
    return p / Math.pow(1 - 2.25577e-5 * h, 5.25588);
  }

  // Sensação térmica pelo vento (wind chill, fórmula canadense/NWS). Vale para T <= 10 °C e vento >= 4,8 km/h; fora disso devolve null.
  function sensacaoVento(tC, vKmh) {
    if (!ok(tC) || !ok(vKmh) || tC > 10 || vKmh < 4.8) return null;
    var f = Math.pow(vKmh, 0.16);
    return 13.12 + 0.6215 * tC - 11.37 * f + 0.3965 * tC * f;
  }

  var PONTOS = ["N", "NNE", "NE", "ENE", "L", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  var NOMES_PONTOS = { N: "norte", NNE: "norte-nordeste", NE: "nordeste", ENE: "leste-nordeste", L: "leste", ESE: "leste-sudeste", SE: "sudeste", SSE: "sul-sudeste", S: "sul", SSO: "sul-sudoeste", SO: "sudoeste", OSO: "oeste-sudoeste", O: "oeste", ONO: "oeste-noroeste", NO: "noroeste", NNO: "norte-noroeste" };
  function pontoCardeal(graus) {
    if (!ok(graus)) return null;
    var g = ((graus % 360) + 360) % 360;
    var sigla = PONTOS[Math.floor((g + 11.25) / 22.5) % 16];
    return { sigla: sigla, nome: NOMES_PONTOS[sigla] };
  }
  // quadrante usado para escolher o texto (N: 315-45, L: 45-135, S: 135-225, O: 225-315)
  function quadranteDe(graus) {
    var g = ((graus % 360) + 360) % 360;
    if (g >= 315 || g < 45) return -Infinity;
    return g < 135 ? 45 : g < 225 ? 135 : 225;
  }

  // avaliar("temperatura", 33) -> { elemento, valor, banda, extras }; valor inválido ou ausente -> null (nunca vira zero)
  function avaliar(id, valor, opcoes) {
    var el = ELEMENTOS[id], o = opcoes || {};
    if (!el || !ok(valor)) return null;
    if (valor < el.min || valor > el.max) return { elemento: el, id: id, valor: valor, erro: "Valor fora do intervalo aceito (" + el.min + " a " + el.max + ")." };
    var r = { elemento: el, id: id, valor: valor, extras: {} };
    var v = valor;
    if (id === "pressao") {
      if (!ok(o.altitude)) { r.banda = null; r.extras.semAltitude = true; return r; }
      var nm = pressaoNivelDoMar(valor, o.altitude);
      if (nm === null) { r.erro = "Altitude inválida."; return r; }
      r.extras.nivelDoMar = Math.round(nm * 10) / 10;
      v = nm;
    } else if (id === "uv") {
      v = Math.round(valor);
    } else if (id === "direcao") {
      r.extras.ponto = pontoCardeal(valor);
      v = quadranteDe(valor);
    } else if (id === "chuva") {
      var j = ["1h", "24h", "72h", "168h"].indexOf(o.janela) > -1 ? o.janela : "1h";
      r.extras.janela = j;
      r.banda = achar(el.bandasPorJanela[j], valor);
      var esc = achar(el.escalaPorJanela[j], valor);
      if (esc) r.extras.intensidade = esc.nome;
      return r;
    } else if (id === "vento") {
      var s = sensacaoVento(o.temperatura, valor);
      if (s !== null) r.extras.sensacao = Math.round(s * 10) / 10;
    }
    r.banda = achar(el.bandas, v);
    return r;
  }

  // Texto curto para publicação (WhatsApp, panfleto): valor, faixa e procedimentos principais.
  function textoPublicacao(res) {
    if (!res || !res.banda) return "";
    var el = res.elemento, b = res.banda;
    var un = el.unidade ? (el.unidade === "°C" || el.unidade === "°" || el.unidade === "%" ? el.unidade : " " + el.unidade) : "";
    var linhas = [el.icone + " " + el.titulo + ": " + String(res.valor).replace(".", ",") + un + " — " + b.nome];
    if (res.extras && ok(res.extras.nivelDoMar)) linhas[0] += " (equivale a " + String(res.extras.nivelDoMar).replace(".", ",") + " hPa ao nível do mar)";
    b.procedimentos.slice(0, 4).forEach(function (p) { linhas.push("• " + p); });
    linhas.push("Fonte da faixa: " + FONTES[b.fonte] + ".");
    linhas.push("Orientação geral; confirme avisos oficiais com a Defesa Civil e o INMET. Emergência: 199 (Defesa Civil) / 193 (Bombeiros).");
    return linhas.join("\n");
  }

  w.Guia = { ELEMENTOS: ELEMENTOS, FONTES: FONTES, AVISO_GERAL: AVISO_GERAL, avaliar: avaliar, textoPublicacao: textoPublicacao,
    pressaoNivelDoMar: pressaoNivelDoMar, sensacaoVento: sensacaoVento, pontoCardeal: pontoCardeal };
})(typeof window !== "undefined" ? window : this);
