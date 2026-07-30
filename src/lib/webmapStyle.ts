/**
 * ⚠️ АВТОМАТААР ҮҮССЭН ФАЙЛ — ГАРААР БҮҮ ЗАСВАРЛА.
 *   Үүсгэгч: tools/webmap_style.mjs
 *   Эх webmap: d790321542504a54afd006e277d7a137
 *
 * Webmap-ийн давхарга бүрийн ЗАГВАР (renderer JSON · bloom effect · opacity)
 * үйлчилгээний URL-аар түлхүүрлэгдсэн. MapCanvas давхарга бүрээ URL-аар нь
 * эндээс хайж, олдвол `Renderer.fromJSON()`-д ШУУД өгнө — тиймээс газрын
 * зураг webmap дээр харагдаж буйтай яг ижил. Олдоогүй давхарга (хяналт,
 * кадастр г.м. энэ webmap-д байхгүй) хуучин каталогийн загвараа хэрэглэнэ.
 *
 * Webmap засагдвал: `node tools/webmap_style.mjs` ажиллуулж дахин үүсгэнэ.
 */

export type WebmapStyle = {
  /** drawingInfo.renderer — webmap-ийн ЯГ хэлбэрээр (Renderer.fromJSON-д) */
  renderer?: unknown;
  /** Масштабаас хамаарсан bloom — SDK-ийн layer.effect хэлбэрт хөрвүүлсэн */
  effect?: { scale: number; value: string }[];
  opacity?: number;
  /** Каталогийн swatch-д — renderer-ийн гол өнгө */
  color?: string;
};

export const WEBMAP_ITEM = "d790321542504a54afd006e277d7a137";

const S: Record<string, WebmapStyle> = {
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/busiin_medeelel_final/featureserver/0": {
    "renderer": {
      "type": "uniqueValue",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 1.5686081582466667,
              "value": 4614
            },
            {
              "size": 0.7843040791233333,
              "value": 14419
            },
            {
              "size": 0.39215203956166667,
              "value": 57676
            },
            {
              "size": 0,
              "value": 115352
            }
          ],
          "target": "outline"
        }
      ],
      "field1": "Angilal",
      "uniqueValueGroups": [
        {
          "classes": [
            {
              "label": "олон нийтийн бүс",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  255,
                  127,
                  127,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    255,
                    127,
                    127,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "олон нийтийн бүс"
                ]
              ]
            },
            {
              "label": "нийгмийн дэд бүтэц",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  127,
                  222,
                  255,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    127,
                    222,
                    255,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "нийгмийн дэд бүтэц"
                ]
              ]
            },
            {
              "label": "ногоон байгууламж тохжилт",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  79,
                  127,
                  51,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    79,
                    127,
                    51,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "ногоон байгууламж тохжилт"
                ]
              ]
            },
            {
              "label": "орон сууцны бүс",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  255,
                  179,
                  0,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    255,
                    179,
                    0,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "орон сууцны бүс"
                ]
              ]
            },
            {
              "label": "газар чөлөөлөлт дутуу",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  74,
                  35,
                  51,
                  128
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    74,
                    35,
                    51,
                    128
                  ],
                  "width": 0.96,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "газар чөлөөлөлт дутуу"
                ]
              ]
            },
            {
              "label": "одоо байгаа барилга",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  255,
                  255,
                  127,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    255,
                    255,
                    127,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "одоо байгаа барилга"
                ]
              ]
            },
            {
              "label": "дэд бүтэц",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  0,
                  81,
                  153,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    0,
                    81,
                    153,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "дэд бүтэц"
                ]
              ]
            },
            {
              "label": "таун хаус",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  132,
                  0,
                  255,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    132,
                    0,
                    255,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "таун хаус"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "label": "олон нийтийн бүс",
          "symbol": {
            "type": "esriSFS",
            "color": [
              255,
              127,
              127,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                255,
                127,
                127,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "олон нийтийн бүс"
        },
        {
          "label": "нийгмийн дэд бүтэц",
          "symbol": {
            "type": "esriSFS",
            "color": [
              127,
              222,
              255,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                127,
                222,
                255,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "нийгмийн дэд бүтэц"
        },
        {
          "label": "ногоон байгууламж тохжилт",
          "symbol": {
            "type": "esriSFS",
            "color": [
              79,
              127,
              51,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                79,
                127,
                51,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "ногоон байгууламж тохжилт"
        },
        {
          "label": "орон сууцны бүс",
          "symbol": {
            "type": "esriSFS",
            "color": [
              255,
              179,
              0,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                255,
                179,
                0,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "орон сууцны бүс"
        },
        {
          "label": "газар чөлөөлөлт дутуу",
          "symbol": {
            "type": "esriSFS",
            "color": [
              74,
              35,
              51,
              128
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                74,
                35,
                51,
                128
              ],
              "width": 0.96,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "газар чөлөөлөлт дутуу"
        },
        {
          "label": "одоо байгаа барилга",
          "symbol": {
            "type": "esriSFS",
            "color": [
              255,
              255,
              127,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                255,
                255,
                127,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "одоо байгаа барилга"
        },
        {
          "label": "дэд бүтэц",
          "symbol": {
            "type": "esriSFS",
            "color": [
              0,
              81,
              153,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                0,
                81,
                153,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "дэд бүтэц"
        },
        {
          "label": "таун хаус",
          "symbol": {
            "type": "esriSFS",
            "color": [
              132,
              0,
              255,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                132,
                0,
                255,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "таун хаус"
        }
      ]
    },
    "color": "#ff7f7f"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/бусад_мэдээлэл_20260724/featureserver/193": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 4.170231432125088,
              "value": 141.062147
            },
            {
              "size": 2.085115716062544,
              "value": 1128.4971765
            },
            {
              "size": 1.5638367870469079,
              "value": 9027.977411
            },
            {
              "size": 1.042557858031272,
              "value": 72223.819286
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          255,
          255,
          255,
          255
        ],
        "width": 1.56,
        "style": "esriSLSSolid"
      }
    },
    "color": "#ffffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/29": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          199,
          197,
          197,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#c7c5c5"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/27": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.15,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                176,
                171,
                171,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                194,
                192,
                192,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#b0abab"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/14": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "effects": [
            {
              "type": "CIMGeometricEffectAddControlPoints",
              "angleTolerance": 120
            }
          ],
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "effects": [
                {
                  "type": "CIMGeometricEffectDashes",
                  "dashTemplate": [
                    4,
                    4
                  ],
                  "lineDashEnding": "HalfPattern",
                  "controlPointEnding": "HalfPattern"
                }
              ],
              "enable": true,
              "colorLocked": true,
              "capStyle": "Butt",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "color": [
                255,
                255,
                255,
                255
              ]
            },
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Butt",
              "joinStyle": "Miter",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 6,
              "color": [
                173,
                172,
                172,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#ffffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/бусад_мэдээлэл_20260724/featureserver/194": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 1.5,
              "value": 36111.909643
            },
            {
              "size": 0.75,
              "value": 288895.2771445
            },
            {
              "size": 0.5625,
              "value": 2311162.2171545
            },
            {
              "size": 0.375,
              "value": 18489297.737236
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          255,
          255,
          255,
          255
        ],
        "width": 1.5,
        "style": "esriSLSSolid"
      }
    },
    "color": "#ffffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/12": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.75,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                135,
                135,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#878787",
    "effect": [
      {
        "scale": 36111.909644,
        "value": "bloom(2, 0px, 0.1)"
      },
      {
        "scale": 9027.977411,
        "value": "bloom(4, 0px, 0.1)"
      },
      {
        "scale": 2256.99435275,
        "value": "bloom(8, 0px, 0.1)"
      }
    ]
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/5_n_usan_san/featureserver/0": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          0,
          51,
          153,
          64
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            51,
            153,
            255
          ],
          "width": 0.563,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#003399"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/26": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.075,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                14,
                79,
                56,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                52,
                117,
                94,
                77
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#0e4f38"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/25": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          113,
          171,
          94,
          179
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.563,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#71ab5e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/tree_1/featureserver/0": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 3,
              "value": 124
            },
            {
              "size": 1.5,
              "value": 388
            },
            {
              "size": 1.125,
              "value": 1552
            },
            {
              "size": 0.75,
              "value": 3104
            }
          ],
          "target": "outline"
        }
      ],
      "symbol": {
        "type": "esriSFS",
        "color": [
          173,
          252,
          116,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#adfc74",
    "effect": [
      {
        "scale": 2256.994352,
        "value": "bloom(0.25, 0px, 0.1)"
      },
      {
        "scale": 564.248588,
        "value": "bloom(0.5, 0px, 0.1)"
      },
      {
        "scale": 141.062147,
        "value": "bloom(1, 0px, 0.1)"
      }
    ]
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/222": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                99,
                14,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                135,
                99,
                14,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#87630e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/218": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                99,
                14,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                135,
                99,
                14,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#87630e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/213": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                99,
                14,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                135,
                99,
                14,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#87630e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/210": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                99,
                14,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                135,
                99,
                14,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#87630e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/205": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                99,
                14,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                135,
                99,
                14,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#87630e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/203": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                99,
                14,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                135,
                99,
                14,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#87630e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/198": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                135,
                99,
                14,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                135,
                99,
                14,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#87630e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/101": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 3,
              "value": 60
            },
            {
              "size": 1.5,
              "value": 186
            },
            {
              "size": 1.125,
              "value": 746
            },
            {
              "size": 0.75,
              "value": 1491
            }
          ],
          "target": "outline"
        }
      ],
      "symbol": {
        "type": "esriSFS",
        "color": [
          173,
          17,
          212,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            92,
            92,
            92,
            64
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/102": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 1.689315042831973,
              "value": 282.124294
            },
            {
              "size": 0.8446575214159865,
              "value": 2256.994353
            },
            {
              "size": 0.6334931410619898,
              "value": 18055.954822
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          173,
          17,
          212,
          255
        ],
        "width": 0.75,
        "style": "esriSLSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/103": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 3,
              "value": 57
            },
            {
              "size": 1.5,
              "value": 179
            },
            {
              "size": 1.125,
              "value": 715
            },
            {
              "size": 0.75,
              "value": 1430
            }
          ],
          "target": "outline"
        }
      ],
      "symbol": {
        "type": "esriSFS",
        "color": [
          173,
          17,
          212,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            92,
            92,
            92,
            64
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/104": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 1.689315042831973,
              "value": 282.124294
            },
            {
              "size": 0.8446575214159865,
              "value": 2256.994353
            },
            {
              "size": 0.6334931410619898,
              "value": 18055.954822
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          173,
          17,
          212,
          255
        ],
        "width": 0.75,
        "style": "esriSLSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/105": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 3,
              "value": 59
            },
            {
              "size": 1.5,
              "value": 184
            },
            {
              "size": 1.125,
              "value": 734
            },
            {
              "size": 0.75,
              "value": 1469
            }
          ],
          "target": "outline"
        }
      ],
      "symbol": {
        "type": "esriSFS",
        "color": [
          173,
          17,
          212,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            92,
            92,
            92,
            64
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/106": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 1.6897154028592802,
              "value": 282.124294
            },
            {
              "size": 0.8448577014296401,
              "value": 2256.994353
            },
            {
              "size": 0.63364327607223,
              "value": 18055.954822
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          173,
          17,
          212,
          255
        ],
        "width": 0.75,
        "style": "esriSLSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/107": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 3,
              "value": 56
            },
            {
              "size": 1.5,
              "value": 174
            },
            {
              "size": 1.125,
              "value": 698
            },
            {
              "size": 0.75,
              "value": 1395
            }
          ],
          "target": "outline"
        }
      ],
      "symbol": {
        "type": "esriSFS",
        "color": [
          173,
          17,
          212,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/108": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 2.5227602962645617,
              "value": 282.124294
            },
            {
              "size": 1.2613801481322808,
              "value": 2256.994353
            },
            {
              "size": 0.9460351110992105,
              "value": 18055.954822
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          173,
          17,
          212,
          255
        ],
        "width": 1.125,
        "style": "esriSLSSolid"
      }
    },
    "color": "#ad11d4"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/15": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 2.511647252871642,
              "value": 282.124294
            },
            {
              "size": 1.255823626435821,
              "value": 2256.994353
            },
            {
              "size": 0.9418677198268656,
              "value": 18055.954822
            },
            {
              "size": 0.6279118132179105,
              "value": 144447.638572
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          25,
          0,
          255,
          255
        ],
        "width": 1.125,
        "style": "esriSLSShortDash"
      }
    },
    "color": "#1900ff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/246": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          99,
          43,
          0,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.563,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/93": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          99,
          43,
          0,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.563,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/94": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 3,
              "value": 79
            },
            {
              "size": 1.5,
              "value": 246
            },
            {
              "size": 1.125,
              "value": 986
            },
            {
              "size": 0.75,
              "value": 1972
            }
          ],
          "target": "outline"
        }
      ],
      "symbol": {
        "type": "esriSFS",
        "color": [
          99,
          43,
          0,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/95": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 3.15589780179732,
              "value": 70.5310735
            },
            {
              "size": 1.57794890089866,
              "value": 564.248588
            },
            {
              "size": 1.1834616756739949,
              "value": 4513.988705
            },
            {
              "size": 0.78897445044933,
              "value": 36111.909643
            }
          ]
        }
      ],
      "symbol": {
        "type": "esriSLS",
        "color": [
          99,
          43,
          0,
          255
        ],
        "width": 1.125,
        "style": "esriSLSSolid"
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/96": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          99,
          43,
          0,
          128
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            0
          ],
          "width": 0.563,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/97": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSLS",
        "color": [
          99,
          43,
          0,
          255
        ],
        "width": 1.125,
        "style": "esriSLSSolid"
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/98": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                99,
                43,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/99": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                99,
                43,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/115": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                99,
                43,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/100": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                99,
                43,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#632b00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/221": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                37,
                125,
                118,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                0,
                0,
                0,
                0
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#257d76"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/217": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                37,
                125,
                118,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                0,
                0,
                0,
                0
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#257d76"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/214": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.5,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                37,
                125,
                118,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                37,
                125,
                118,
                0
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#257d76"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/209": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                170,
                170,
                170,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                37,
                125,
                118,
                128
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#aaaaaa"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/206": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          0,
          0,
          0,
          0
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            37,
            125,
            118,
            255
          ],
          "width": 1.5,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/201": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          0,
          0,
          0,
          0
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            37,
            125,
            118,
            255
          ],
          "width": 1.5,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/195": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          0,
          0,
          0,
          0
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            37,
            125,
            118,
            255
          ],
          "width": 1.5,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/24": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 1.0782713745757109,
              "value": 587
            },
            {
              "size": 0.5391356872878554,
              "value": 1833
            },
            {
              "size": 0.2695678436439277,
              "value": 7333
            },
            {
              "size": 0,
              "value": 14667
            }
          ],
          "target": "outline"
        }
      ],
      "symbol": {
        "type": "esriSFS",
        "color": [
          255,
          183,
          0,
          51
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            255,
            183,
            0,
            179
          ],
          "width": 0.525,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    },
    "color": "#ffb700",
    "effect": [
      {
        "scale": 36111.909644,
        "value": "bloom(0.25, 0px, 0.1)"
      },
      {
        "scale": 9027.977411,
        "value": "bloom(0.5, 0px, 0.1)"
      },
      {
        "scale": 2256.99435275,
        "value": "bloom(1, 0px, 0.1)"
      }
    ]
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/242": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                110,
                110,
                110,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                174,
                242,
                219,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#6e6e6e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/243": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                110,
                110,
                110,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                110,
                110,
                110,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#6e6e6e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/232": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                66,
                207,
                181,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                174,
                242,
                219,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#42cfb5"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/228": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                66,
                207,
                181,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                174,
                242,
                219,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#42cfb5"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/230": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                174,
                242,
                219,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                66,
                207,
                181,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#aef2db"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/237": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                73,
                119,
                143,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                96,
                192,
                240,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#49778f"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/236": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                73,
                119,
                143,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                96,
                192,
                240,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#49778f"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/235": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                73,
                119,
                143,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                96,
                192,
                240,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#49778f"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/234": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                110,
                110,
                110,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                73,
                119,
                143,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#6e6e6e"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/226": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 0.7,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                73,
                119,
                143,
                255
              ]
            },
            {
              "type": "CIMSolidFill",
              "enable": true,
              "color": [
                96,
                192,
                240,
                255
              ]
            }
          ],
          "angleAlignment": "Map"
        }
      }
    },
    "color": "#49778f"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/6": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "animations": [
                {
                  "type": "CIMSymbolAnimationMoveAlongLine",
                  "movementType": "Speed",
                  "speed": 30,
                  "continuous": true,
                  "animatedSymbolProperties": {
                    "type": "CIMAnimatedSymbolProperties",
                    "playAnimation": true,
                    "repeatType": "Loop",
                    "easing": "Linear"
                  }
                }
              ],
              "enable": true,
              "colorLocked": true,
              "anchorPoint": {
                "x": 0,
                "y": -0.000005299442594974835
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Y",
              "size": 3.75,
              "billboardMode3D": "FaceNearPlane",
              "markerPlacement": {
                "type": "CIMMarkerPlacementAlongLineSameSize",
                "placePerPart": true,
                "angleToLine": true,
                "endings": "WithHalfGap",
                "placementTemplate": [
                  6.666666666666667
                ]
              },
              "frame": {
                "xmin": 0,
                "ymin": 0,
                "xmax": 17,
                "ymax": 17
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          12.46,
                          2.13
                        ],
                        [
                          17,
                          8.5
                        ],
                        [
                          12.5,
                          14.87
                        ],
                        [
                          0,
                          14.87
                        ],
                        [
                          4.56,
                          8.5
                        ],
                        [
                          0,
                          2.13
                        ],
                        [
                          12.46,
                          2.13
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          255,
                          255,
                          255,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true,
              "clippingPath": {
                "type": "CIMClippingPath",
                "clippingType": "Intersect",
                "path": {
                  "rings": [
                    [
                      [
                        0,
                        0
                      ],
                      [
                        17,
                        0
                      ],
                      [
                        17,
                        17
                      ],
                      [
                        0,
                        17
                      ],
                      [
                        0,
                        0
                      ]
                    ]
                  ]
                }
              }
            },
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 2.916666666666667,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                0,
                77,
                168,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#ffffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/2": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 7.498662430466448,
              "value": 564.248588
            },
            {
              "size": 5.998929944373158,
              "value": 4513.988705
            },
            {
              "size": 2.999464972186579,
              "value": 36111.909643
            },
            {
              "size": 1.4997324860932895,
              "value": 288895.277144
            }
          ]
        }
      ],
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPoint": {
                "x": 0,
                "y": 0
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 5.573,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          255,
                          191,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          255,
                          85,
                          0,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true,
              "rotation": 360
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display",
          "angle": 360
        }
      }
    },
    "color": "#ffbf00"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/1": {
    "renderer": {
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 7.5,
              "value": 4513.988705
            },
            {
              "size": 6,
              "value": 36111.909643
            },
            {
              "size": 3,
              "value": 288895.277144
            },
            {
              "size": 1.5,
              "value": 2311162.217155
            }
          ]
        }
      ],
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "name": "New_41a20d6c-daee-403a-9a97-cf9e7eb9c186",
              "colorLocked": true,
              "anchorPoint": {
                "x": 0,
                "y": 0,
                "z": 0
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Y",
              "size": 3.75,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": 0,
                "ymin": 0,
                "xmax": 17,
                "ymax": 17
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          11.27,
                          5.68
                        ],
                        [
                          5.68,
                          5.68
                        ],
                        [
                          5.68,
                          11.27
                        ],
                        [
                          11.27,
                          11.27
                        ],
                        [
                          11.27,
                          5.68
                        ]
                      ],
                      [
                        [
                          15.66,
                          1.36
                        ],
                        [
                          15.66,
                          15.66
                        ],
                        [
                          1.36,
                          15.66
                        ],
                        [
                          1.36,
                          1.36
                        ],
                        [
                          15.66,
                          1.36
                        ]
                      ],
                      [
                        [
                          17,
                          0
                        ],
                        [
                          0,
                          0
                        ],
                        [
                          0,
                          17
                        ],
                        [
                          17,
                          17
                        ],
                        [
                          17,
                          0
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true,
              "rotation": 360
            },
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPoint": {
                "x": 0,
                "y": 0,
                "z": 0
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Y",
              "size": 3.75,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": 0,
                "ymin": 0,
                "xmax": 17,
                "ymax": 17
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          17
                        ],
                        [
                          17,
                          17
                        ],
                        [
                          17,
                          0
                        ],
                        [
                          0,
                          0
                        ],
                        [
                          0,
                          17
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          255,
                          0,
                          255,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true,
              "rotation": 360
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display",
          "angle": 360
        }
      }
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/127": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                255,
                119,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#ff7700"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/126": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                255,
                119,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#ff7700"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/125": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                255,
                119,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#ff7700"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/124": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1.125,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                255,
                119,
                0,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#ff7700"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/36": {
    "renderer": {
      "type": "uniqueValue",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "Max($feature.LineWt / 100 * 2.83, 1)",
          "valueExpressionTitle": "",
          "maxDataValue": 1,
          "maxSize": 1,
          "minDataValue": 0,
          "minSize": 0
        }
      ],
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                215,
                245,
                252,
                255
              ]
            }
          ]
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        0,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
              "label": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "dashTemplate": [
                            1.4173236,
                            0.7086618
                          ],
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        255,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "Xolboonii trass",
                  "210",
                  "20-HIDDEN"
                ]
              ]
            },
            {
              "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        0,
                        0,
                        0,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "bagts 3 holboo",
                  "7",
                  "Continuous"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    0,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
          "label": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "dashTemplate": [
                        1.4173236,
                        0.7086618
                      ],
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    255,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "Xolboonii trass,210,20-HIDDEN"
        },
        {
          "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    0,
                    0,
                    0,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "bagts 3 holboo,7,Continuous"
        }
      ]
    },
    "color": "#d7f5fc"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/37": {
    "renderer": {
      "type": "uniqueValue",
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPoint": {
                "x": 0,
                "y": 0
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 4,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          188,
                          184,
                          252,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display"
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  0,
                                  0,
                                  255,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "bagts 3 holboo",
                  "7",
                  "Continuous"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              0,
                              0,
                              255,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "bagts 3 holboo,7,Continuous"
        }
      ]
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/39": {
    "renderer": {
      "type": "uniqueValue",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "Max($feature.LineWt / 100 * 2.83, 1)",
          "valueExpressionTitle": "",
          "maxDataValue": 1,
          "maxSize": 1,
          "minDataValue": 0,
          "minSize": 0
        }
      ],
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                252,
                217,
                192,
                255
              ]
            }
          ]
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        0,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        0,
                        0,
                        0,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "bagts 3 holboo",
                  "7",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"bagts 3 holboo\",210,\"20-HIDDEN\"]",
              "label": "[\"bagts 3 holboo\",210,\"20-HIDDEN\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "dashTemplate": [
                            1.4173236,
                            0.7086618
                          ],
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        255,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "bagts 3 holboo",
                  "210",
                  "20-HIDDEN"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    0,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    0,
                    0,
                    0,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "bagts 3 holboo,7,Continuous"
        },
        {
          "description": "[\"bagts 3 holboo\",210,\"20-HIDDEN\"]",
          "label": "[\"bagts 3 holboo\",210,\"20-HIDDEN\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "dashTemplate": [
                        1.4173236,
                        0.7086618
                      ],
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    255,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "bagts 3 holboo,210,20-HIDDEN"
        }
      ]
    },
    "color": "#fcd9c0"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/40": {
    "renderer": {
      "type": "uniqueValue",
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPoint": {
                "x": 0,
                "y": 0
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 4,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          215,
                          252,
                          245,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display"
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  0,
                                  0,
                                  255,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "bagts 3 holboo",
                  "7",
                  "Continuous"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              0,
                              0,
                              255,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "label": "[\"bagts 3 holboo\",7,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "bagts 3 holboo,7,Continuous"
        }
      ]
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/42": {
    "renderer": {
      "type": "uniqueValue",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "Max($feature.LineWt / 100 * 2.83, 1)",
          "valueExpressionTitle": "",
          "maxDataValue": 1,
          "maxSize": 1,
          "minDataValue": 0,
          "minSize": 0
        }
      ],
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                225,
                210,
                252,
                255
              ]
            }
          ]
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        0,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
              "label": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "dashTemplate": [
                            1.4173236,
                            0.7086618
                          ],
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        255,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "Xolboonii trass",
                  "210",
                  "20-HIDDEN"
                ]
              ]
            },
            {
              "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        84,
                        84,
                        76,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "bagts 1 holboo",
                  "250",
                  "Continuous"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    0,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
          "label": "[\"Xolboonii trass\",210,\"20-HIDDEN\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "dashTemplate": [
                        1.4173236,
                        0.7086618
                      ],
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    255,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "Xolboonii trass,210,20-HIDDEN"
        },
        {
          "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    84,
                    84,
                    76,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "bagts 1 holboo,250,Continuous"
        }
      ]
    },
    "color": "#e1d2fc"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/43": {
    "renderer": {
      "type": "uniqueValue",
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPoint": {
                "x": 0,
                "y": 0
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 4,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          224,
                          204,
                          252,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display"
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  0,
                                  0,
                                  255,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  84,
                                  84,
                                  76,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "bagts 1 holboo",
                  "250",
                  "Continuous"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              0,
                              0,
                              255,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              84,
                              84,
                              76,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "bagts 1 holboo,250,Continuous"
        }
      ]
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/33": {
    "renderer": {
      "type": "uniqueValue",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "Max($feature.LineWt / 100 * 2.83, 1)",
          "valueExpressionTitle": "",
          "maxDataValue": 1,
          "maxSize": 1,
          "minDataValue": 0,
          "minSize": 0
        }
      ],
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                247,
                194,
                252,
                255
              ]
            }
          ]
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        0,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"bagts 1 holboo\",210,\"20-HIDDEN\"]",
              "label": "[\"bagts 1 holboo\",210,\"20-HIDDEN\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "dashTemplate": [
                            1.4173236,
                            0.7086618
                          ],
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        255,
                        0,
                        255,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "bagts 1 holboo",
                  "210",
                  "20-HIDDEN"
                ]
              ]
            },
            {
              "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMLineSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMSolidStroke",
                      "effects": [
                        {
                          "type": "CIMGeometricEffectDashes",
                          "lineDashEnding": "NoConstraint",
                          "controlPointEnding": "NoConstraint"
                        }
                      ],
                      "enable": true,
                      "capStyle": "Square",
                      "joinStyle": "Round",
                      "lineStyle3D": "Strip",
                      "miterLimit": 10,
                      "width": 1,
                      "height3D": 1,
                      "anchor3D": "Center",
                      "color": [
                        84,
                        84,
                        76,
                        255
                      ]
                    }
                  ],
                  "useRealWorldSymbolSizes": true
                }
              },
              "values": [
                [
                  "bagts 1 holboo",
                  "250",
                  "Continuous"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    0,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"bagts 1 holboo\",210,\"20-HIDDEN\"]",
          "label": "[\"bagts 1 holboo\",210,\"20-HIDDEN\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "dashTemplate": [
                        1.4173236,
                        0.7086618
                      ],
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    255,
                    0,
                    255,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "bagts 1 holboo,210,20-HIDDEN"
        },
        {
          "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMLineSymbol",
              "symbolLayers": [
                {
                  "type": "CIMSolidStroke",
                  "effects": [
                    {
                      "type": "CIMGeometricEffectDashes",
                      "lineDashEnding": "NoConstraint",
                      "controlPointEnding": "NoConstraint"
                    }
                  ],
                  "enable": true,
                  "capStyle": "Square",
                  "joinStyle": "Round",
                  "lineStyle3D": "Strip",
                  "miterLimit": 10,
                  "width": 1,
                  "height3D": 1,
                  "anchor3D": "Center",
                  "color": [
                    84,
                    84,
                    76,
                    255
                  ]
                }
              ],
              "useRealWorldSymbolSizes": true
            }
          },
          "value": "bagts 1 holboo,250,Continuous"
        }
      ]
    },
    "color": "#f7c2fc"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/34": {
    "renderer": {
      "type": "uniqueValue",
      "field1": "Layer",
      "field2": "Color",
      "field3": "Linetype",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPoint": {
                "x": 0,
                "y": 0
              },
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 4,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          252,
                          210,
                          212,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display"
        }
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "Layer,Color,LineType",
          "classes": [
            {
              "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  0,
                                  0,
                                  255,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "MH_EXISTING",
                  "5",
                  "Continuous"
                ]
              ]
            },
            {
              "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
              "symbol": {
                "type": "CIMSymbolReference",
                "symbol": {
                  "type": "CIMPointSymbol",
                  "symbolLayers": [
                    {
                      "type": "CIMVectorMarker",
                      "enable": true,
                      "anchorPoint": {
                        "x": 0,
                        "y": 0
                      },
                      "anchorPointUnits": "Relative",
                      "dominantSizeAxis3D": "Z",
                      "size": 4,
                      "billboardMode3D": "FaceNearPlane",
                      "frame": {
                        "xmin": -2,
                        "ymin": -2,
                        "xmax": 2,
                        "ymax": 2
                      },
                      "markerGraphics": [
                        {
                          "type": "CIMMarkerGraphic",
                          "geometry": {
                            "rings": [
                              [
                                [
                                  0,
                                  2
                                ],
                                [
                                  0.35,
                                  1.97
                                ],
                                [
                                  0.68,
                                  1.88
                                ],
                                [
                                  1,
                                  1.73
                                ],
                                [
                                  1.29,
                                  1.53
                                ],
                                [
                                  1.53,
                                  1.29
                                ],
                                [
                                  1.73,
                                  1
                                ],
                                [
                                  1.88,
                                  0.68
                                ],
                                [
                                  1.97,
                                  0.35
                                ],
                                [
                                  2,
                                  0
                                ],
                                [
                                  1.97,
                                  -0.35
                                ],
                                [
                                  1.88,
                                  -0.68
                                ],
                                [
                                  1.73,
                                  -1
                                ],
                                [
                                  1.53,
                                  -1.29
                                ],
                                [
                                  1.29,
                                  -1.53
                                ],
                                [
                                  1,
                                  -1.73
                                ],
                                [
                                  0.68,
                                  -1.88
                                ],
                                [
                                  0.35,
                                  -1.97
                                ],
                                [
                                  0,
                                  -2
                                ],
                                [
                                  -0.35,
                                  -1.97
                                ],
                                [
                                  -0.68,
                                  -1.88
                                ],
                                [
                                  -1,
                                  -1.73
                                ],
                                [
                                  -1.29,
                                  -1.53
                                ],
                                [
                                  -1.53,
                                  -1.29
                                ],
                                [
                                  -1.73,
                                  -1
                                ],
                                [
                                  -1.88,
                                  -0.68
                                ],
                                [
                                  -1.97,
                                  -0.35
                                ],
                                [
                                  -2,
                                  0
                                ],
                                [
                                  -1.97,
                                  0.35
                                ],
                                [
                                  -1.88,
                                  0.68
                                ],
                                [
                                  -1.73,
                                  1
                                ],
                                [
                                  -1.53,
                                  1.29
                                ],
                                [
                                  -1.29,
                                  1.53
                                ],
                                [
                                  -1,
                                  1.73
                                ],
                                [
                                  -0.68,
                                  1.88
                                ],
                                [
                                  -0.35,
                                  1.97
                                ],
                                [
                                  0,
                                  2
                                ]
                              ]
                            ]
                          },
                          "symbol": {
                            "type": "CIMPolygonSymbol",
                            "symbolLayers": [
                              {
                                "type": "CIMSolidStroke",
                                "enable": true,
                                "capStyle": "Round",
                                "joinStyle": "Round",
                                "lineStyle3D": "Strip",
                                "miterLimit": 10,
                                "width": 0.7,
                                "height3D": 1,
                                "anchor3D": "Center",
                                "color": [
                                  0,
                                  0,
                                  0,
                                  255
                                ]
                              },
                              {
                                "type": "CIMSolidFill",
                                "enable": true,
                                "color": [
                                  84,
                                  84,
                                  76,
                                  255
                                ]
                              }
                            ],
                            "angleAlignment": "Map"
                          }
                        }
                      ],
                      "scaleSymbolsProportionally": true,
                      "respectFrame": true
                    }
                  ],
                  "useRealWorldSymbolSizes": true,
                  "haloSize": 1,
                  "scaleX": 1,
                  "angleAlignment": "Display"
                }
              },
              "values": [
                [
                  "bagts 1 holboo",
                  "250",
                  "Continuous"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "label": "[\"MH_EXISTING\",5,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              0,
                              0,
                              255,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "MH_EXISTING,5,Continuous"
        },
        {
          "description": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "label": "[\"bagts 1 holboo\",250,\"Continuous\"]",
          "symbol": {
            "type": "CIMSymbolReference",
            "symbol": {
              "type": "CIMPointSymbol",
              "symbolLayers": [
                {
                  "type": "CIMVectorMarker",
                  "enable": true,
                  "anchorPoint": {
                    "x": 0,
                    "y": 0
                  },
                  "anchorPointUnits": "Relative",
                  "dominantSizeAxis3D": "Z",
                  "size": 4,
                  "billboardMode3D": "FaceNearPlane",
                  "frame": {
                    "xmin": -2,
                    "ymin": -2,
                    "xmax": 2,
                    "ymax": 2
                  },
                  "markerGraphics": [
                    {
                      "type": "CIMMarkerGraphic",
                      "geometry": {
                        "rings": [
                          [
                            [
                              0,
                              2
                            ],
                            [
                              0.35,
                              1.97
                            ],
                            [
                              0.68,
                              1.88
                            ],
                            [
                              1,
                              1.73
                            ],
                            [
                              1.29,
                              1.53
                            ],
                            [
                              1.53,
                              1.29
                            ],
                            [
                              1.73,
                              1
                            ],
                            [
                              1.88,
                              0.68
                            ],
                            [
                              1.97,
                              0.35
                            ],
                            [
                              2,
                              0
                            ],
                            [
                              1.97,
                              -0.35
                            ],
                            [
                              1.88,
                              -0.68
                            ],
                            [
                              1.73,
                              -1
                            ],
                            [
                              1.53,
                              -1.29
                            ],
                            [
                              1.29,
                              -1.53
                            ],
                            [
                              1,
                              -1.73
                            ],
                            [
                              0.68,
                              -1.88
                            ],
                            [
                              0.35,
                              -1.97
                            ],
                            [
                              0,
                              -2
                            ],
                            [
                              -0.35,
                              -1.97
                            ],
                            [
                              -0.68,
                              -1.88
                            ],
                            [
                              -1,
                              -1.73
                            ],
                            [
                              -1.29,
                              -1.53
                            ],
                            [
                              -1.53,
                              -1.29
                            ],
                            [
                              -1.73,
                              -1
                            ],
                            [
                              -1.88,
                              -0.68
                            ],
                            [
                              -1.97,
                              -0.35
                            ],
                            [
                              -2,
                              0
                            ],
                            [
                              -1.97,
                              0.35
                            ],
                            [
                              -1.88,
                              0.68
                            ],
                            [
                              -1.73,
                              1
                            ],
                            [
                              -1.53,
                              1.29
                            ],
                            [
                              -1.29,
                              1.53
                            ],
                            [
                              -1,
                              1.73
                            ],
                            [
                              -0.68,
                              1.88
                            ],
                            [
                              -0.35,
                              1.97
                            ],
                            [
                              0,
                              2
                            ]
                          ]
                        ]
                      },
                      "symbol": {
                        "type": "CIMPolygonSymbol",
                        "symbolLayers": [
                          {
                            "type": "CIMSolidStroke",
                            "enable": true,
                            "capStyle": "Round",
                            "joinStyle": "Round",
                            "lineStyle3D": "Strip",
                            "miterLimit": 10,
                            "width": 0.7,
                            "height3D": 1,
                            "anchor3D": "Center",
                            "color": [
                              0,
                              0,
                              0,
                              255
                            ]
                          },
                          {
                            "type": "CIMSolidFill",
                            "enable": true,
                            "color": [
                              84,
                              84,
                              76,
                              255
                            ]
                          }
                        ],
                        "angleAlignment": "Map"
                      }
                    }
                  ],
                  "scaleSymbolsProportionally": true,
                  "respectFrame": true
                }
              ],
              "useRealWorldSymbolSizes": true,
              "haloSize": 1,
              "scaleX": 1,
              "angleAlignment": "Display"
            }
          },
          "value": "bagts 1 holboo,250,Continuous"
        }
      ]
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/157": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                0,
                255,
                255,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#00ffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/156": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 3.998,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          119,
                          44,
                          148,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true,
              "rotation": 360
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display",
          "angle": 360
        }
      }
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/154": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                0,
                255,
                255,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#00ffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/153": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 3.998,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          119,
                          44,
                          148,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true,
              "rotation": 360
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display",
          "angle": 360
        }
      }
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/150": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                0,
                255,
                255,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#00ffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/149": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPointSymbol",
          "symbolLayers": [
            {
              "type": "CIMVectorMarker",
              "enable": true,
              "anchorPointUnits": "Relative",
              "dominantSizeAxis3D": "Z",
              "size": 3.998,
              "billboardMode3D": "FaceNearPlane",
              "frame": {
                "xmin": -2,
                "ymin": -2,
                "xmax": 2,
                "ymax": 2
              },
              "markerGraphics": [
                {
                  "type": "CIMMarkerGraphic",
                  "geometry": {
                    "rings": [
                      [
                        [
                          0,
                          2
                        ],
                        [
                          0.35,
                          1.97
                        ],
                        [
                          0.68,
                          1.88
                        ],
                        [
                          1,
                          1.73
                        ],
                        [
                          1.29,
                          1.53
                        ],
                        [
                          1.53,
                          1.29
                        ],
                        [
                          1.73,
                          1
                        ],
                        [
                          1.88,
                          0.68
                        ],
                        [
                          1.97,
                          0.35
                        ],
                        [
                          2,
                          0
                        ],
                        [
                          1.97,
                          -0.35
                        ],
                        [
                          1.88,
                          -0.68
                        ],
                        [
                          1.73,
                          -1
                        ],
                        [
                          1.53,
                          -1.29
                        ],
                        [
                          1.29,
                          -1.53
                        ],
                        [
                          1,
                          -1.73
                        ],
                        [
                          0.68,
                          -1.88
                        ],
                        [
                          0.35,
                          -1.97
                        ],
                        [
                          0,
                          -2
                        ],
                        [
                          -0.35,
                          -1.97
                        ],
                        [
                          -0.68,
                          -1.88
                        ],
                        [
                          -1,
                          -1.73
                        ],
                        [
                          -1.29,
                          -1.53
                        ],
                        [
                          -1.53,
                          -1.29
                        ],
                        [
                          -1.73,
                          -1
                        ],
                        [
                          -1.88,
                          -0.68
                        ],
                        [
                          -1.97,
                          -0.35
                        ],
                        [
                          -2,
                          0
                        ],
                        [
                          -1.97,
                          0.35
                        ],
                        [
                          -1.88,
                          0.68
                        ],
                        [
                          -1.73,
                          1
                        ],
                        [
                          -1.53,
                          1.29
                        ],
                        [
                          -1.29,
                          1.53
                        ],
                        [
                          -1,
                          1.73
                        ],
                        [
                          -0.68,
                          1.88
                        ],
                        [
                          -0.35,
                          1.97
                        ],
                        [
                          0,
                          2
                        ]
                      ]
                    ]
                  },
                  "symbol": {
                    "type": "CIMPolygonSymbol",
                    "symbolLayers": [
                      {
                        "type": "CIMSolidStroke",
                        "enable": true,
                        "capStyle": "Round",
                        "joinStyle": "Round",
                        "lineStyle3D": "Strip",
                        "miterLimit": 10,
                        "width": 0.7,
                        "height3D": 1,
                        "anchor3D": "Center",
                        "color": [
                          0,
                          0,
                          0,
                          255
                        ]
                      },
                      {
                        "type": "CIMSolidFill",
                        "enable": true,
                        "color": [
                          119,
                          44,
                          148,
                          255
                        ]
                      }
                    ],
                    "angleAlignment": "Map"
                  }
                }
              ],
              "scaleSymbolsProportionally": true,
              "respectFrame": true,
              "rotation": 360
            }
          ],
          "haloSize": 1,
          "scaleX": 1,
          "angleAlignment": "Display",
          "angle": 360
        }
      }
    },
    "color": "#000000"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/151": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMLineSymbol",
          "symbolLayers": [
            {
              "type": "CIMSolidStroke",
              "enable": true,
              "capStyle": "Round",
              "joinStyle": "Round",
              "lineStyle3D": "Strip",
              "miterLimit": 10,
              "width": 1,
              "height3D": 1,
              "anchor3D": "Center",
              "color": [
                0,
                255,
                255,
                255
              ]
            }
          ]
        }
      }
    },
    "color": "#00ffff"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260725/featureserver/147": {
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSMS",
        "color": [
          119,
          44,
          148,
          255
        ],
        "angle": 0,
        "xoffset": 0,
        "yoffset": 0,
        "size": 3.75,
        "style": "esriSMSCircle",
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            255
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        }
      }
    },
    "color": "#772c94"
  },
  "https://services.arcgis.com/hjzgwvlnixssnqar/arcgis/rest/services/selbe_et_20260721/featureserver/28": {
    "renderer": {
      "type": "uniqueValue",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "$view.scale",
          "stops": [
            {
              "size": 1.5686081582466667,
              "value": 4614
            },
            {
              "size": 0.7843040791233333,
              "value": 14419
            },
            {
              "size": 0.39215203956166667,
              "value": 57676
            },
            {
              "size": 0,
              "value": 115352
            }
          ],
          "target": "outline"
        }
      ],
      "field1": "Angilal",
      "uniqueValueGroups": [
        {
          "classes": [
            {
              "label": "олон нийтийн бүс",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  255,
                  127,
                  127,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    255,
                    127,
                    127,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "олон нийтийн бүс"
                ]
              ]
            },
            {
              "label": "нийгмийн дэд бүтэц",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  127,
                  222,
                  255,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    127,
                    222,
                    255,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "нийгмийн дэд бүтэц"
                ]
              ]
            },
            {
              "label": "ногоон байгууламж тохжилт",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  79,
                  127,
                  51,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    79,
                    127,
                    51,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "ногоон байгууламж тохжилт"
                ]
              ]
            },
            {
              "label": "орон сууцны бүс",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  255,
                  179,
                  0,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    255,
                    179,
                    0,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "орон сууцны бүс"
                ]
              ]
            },
            {
              "label": "газар чөлөөлөлт дутуу",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  74,
                  35,
                  51,
                  128
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    74,
                    35,
                    51,
                    128
                  ],
                  "width": 0.96,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "газар чөлөөлөлт дутуу"
                ]
              ]
            },
            {
              "label": "одоо байгаа барилга",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  255,
                  255,
                  127,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    255,
                    255,
                    127,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "одоо байгаа барилга"
                ]
              ]
            },
            {
              "label": "дэд бүтэц",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  0,
                  81,
                  153,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    0,
                    81,
                    153,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "дэд бүтэц"
                ]
              ]
            },
            {
              "label": "таун хаус",
              "symbol": {
                "type": "esriSFS",
                "color": [
                  132,
                  0,
                  255,
                  51
                ],
                "outline": {
                  "type": "esriSLS",
                  "color": [
                    132,
                    0,
                    255,
                    255
                  ],
                  "width": 0.75,
                  "style": "esriSLSSolid"
                },
                "style": "esriSFSSolid"
              },
              "values": [
                [
                  "таун хаус"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "label": "олон нийтийн бүс",
          "symbol": {
            "type": "esriSFS",
            "color": [
              255,
              127,
              127,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                255,
                127,
                127,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "олон нийтийн бүс"
        },
        {
          "label": "нийгмийн дэд бүтэц",
          "symbol": {
            "type": "esriSFS",
            "color": [
              127,
              222,
              255,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                127,
                222,
                255,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "нийгмийн дэд бүтэц"
        },
        {
          "label": "ногоон байгууламж тохжилт",
          "symbol": {
            "type": "esriSFS",
            "color": [
              79,
              127,
              51,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                79,
                127,
                51,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "ногоон байгууламж тохжилт"
        },
        {
          "label": "орон сууцны бүс",
          "symbol": {
            "type": "esriSFS",
            "color": [
              255,
              179,
              0,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                255,
                179,
                0,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "орон сууцны бүс"
        },
        {
          "label": "газар чөлөөлөлт дутуу",
          "symbol": {
            "type": "esriSFS",
            "color": [
              74,
              35,
              51,
              128
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                74,
                35,
                51,
                128
              ],
              "width": 0.96,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "газар чөлөөлөлт дутуу"
        },
        {
          "label": "одоо байгаа барилга",
          "symbol": {
            "type": "esriSFS",
            "color": [
              255,
              255,
              127,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                255,
                255,
                127,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "одоо байгаа барилга"
        },
        {
          "label": "дэд бүтэц",
          "symbol": {
            "type": "esriSFS",
            "color": [
              0,
              81,
              153,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                0,
                81,
                153,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "дэд бүтэц"
        },
        {
          "label": "таун хаус",
          "symbol": {
            "type": "esriSFS",
            "color": [
              132,
              0,
              255,
              51
            ],
            "outline": {
              "type": "esriSLS",
              "color": [
                132,
                0,
                255,
                255
              ],
              "width": 0.75,
              "style": "esriSLSSolid"
            },
            "style": "esriSFSSolid"
          },
          "value": "таун хаус"
        }
      ]
    },
    "color": "#ff7f7f"
  }
};

/** URL-ыг харьцуулахын өмнө нэг хэлбэрт (кирилл зам encode-той ч, шуудхан ч ирдэг) */
const norm = (u: string) => decodeURIComponent(u).replace(/\/+$/, "").toLowerCase();

/** Давхаргын үйлчилгээний URL → webmap-ийн загвар (байхгүй бол undefined) */
export const webmapStyleOf = (url: string): WebmapStyle | undefined => S[norm(url)];
