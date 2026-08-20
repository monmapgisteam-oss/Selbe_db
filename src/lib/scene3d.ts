import { t as tr } from '@/lib/i18nCore';
/**
 * SCENE3D — Web Scene 'selbe_3D_ 0804' (572442952bcd47d3a2adf68199f62d24)-ээс
 * АВТОМАТААР хуулсан 3D давхаргууд + тэдгээрийн ЯГ scene-ийн renderer (style).
 *
 * ⚠️ Service-ийн default renderer нь ХАВТГАЙ 2D (esriSFS) — scene дотор зохиогч
 * 3D болгосон (барилгыг өндрөөр өргөх Extrude, 3D мод г.м.). ⚠️ Барилгын өндрийг
 * 'Давх_1' (давхрын тоо) БИШ, 'Ondor_m' (бодит метр өндөр) талбараар өргөнө.
 * Тиймээс энд
 * renderer-ийг scene-ээс хуулж, 'rendererJsonUtils.fromJSON'-оор ШУУД тавина —
 * хөрвүүлэлт огт хийхгүй тул scene дээр харагдаж буйтай 100% ижил.
 *
 * Дахин үүсгэх: webscene data-г татаад flatten хийж энэ файлыг дарж бичнэ.
 * Эдгээр нь ЗӨВХӨН BIM (SceneView) горимд FeatureLayer болж нэмэгдэнэ.
 */
export type Scene3DLayer = {
  id: string;
  title: string;
  /** Scene дэх бүлэг (лавлагаа) */
  group: string | null;
  url: string;
  opacity: number;
  /** FeatureLayer.elevationInfo — ихэвчлэн onTheGround */
  elevationInfo: unknown;
  /** ArcGIS JS-API renderer JSON — rendererJsonUtils.fromJSON-д өгнө */
  renderer: unknown;
};

export const SCENE3D_LAYERS: Scene3DLayer[] = [
  {
    "id": "scene3d:16",
    "title": tr('Гол'),
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/16",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Water",
            "color": [
              168,
              216,
              255
            ],
            "waveDirection": 0,
            "waveStrength": "calm"
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:15",
    "title": 'Дугуйн_зам',
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/15",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Fill",
            "material": {
              "color": [
                255,
                167,
                127
              ]
            },
            "pattern": {
              "type": "style",
              "style": "solid"
            },
            "outline": {
              "color": [
                0,
                0,
                0
              ],
              "size": 0.7
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:14",
    "title": "Suudrevch_polygon",
    "group": tr('Сүүдрэвч'),
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/14",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Fill",
            "material": {
              "color": [
                132,
                0,
                168
              ]
            },
            "pattern": {
              "type": "style",
              "style": "solid"
            },
            "outline": {
              "color": [
                255,
                255,
                255
              ],
              "size": 0.4
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:13",
    "title": "Suudrevch_line",
    "group": tr('Сүүдрэвч'),
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/13",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "LineSymbol3D",
        "symbolLayers": [
          {
            "type": "Line",
            "material": {
              "color": [
                255,
                255,
                255
              ]
            },
            "join": "round",
            "cap": "round",
            "size": 0.4,
            "pattern": {
              "type": "style",
              "style": "solid"
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:11",
    "title": "Huuhdiin_togloom_polygon",
    "group": tr('Хүүхдийн тоглоом'),
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/11",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Fill",
            "material": {
              "color": [
                107,
                171,
                39
              ]
            },
            "pattern": {
              "type": "style",
              "style": "solid"
            },
            "outline": {
              "color": [
                110,
                110,
                110
              ],
              "size": 0.7
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:10",
    "title": "huuhdiin_togloom_line",
    "group": tr('Хүүхдийн тоглоом'),
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/10",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "LineSymbol3D",
        "symbolLayers": [
          {
            "type": "Line",
            "material": {
              "color": [
                189,
                208,
                252
              ]
            },
            "join": "round",
            "cap": "round",
            "size": 1,
            "pattern": {
              "type": "style",
              "style": "solid"
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:8",
    "title": tr('Спорт талбай'),
    "group": tr('Спорт талбай'),
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/8",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Fill",
            "material": {
              "color": [
                32,
                133,
                37
              ]
            },
            "pattern": {
              "type": "style",
              "style": "solid"
            },
            "outline": {
              "color": [
                110,
                110,
                110
              ],
              "size": 0.7
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:7",
    "title": "sport_area_line",
    "group": tr('Спорт талбай'),
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/7",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "LineSymbol3D",
        "symbolLayers": [
          {
            "type": "Line",
            "material": {
              "color": [
                253,
                253,
                253
              ]
            },
            "join": "round",
            "cap": "round",
            "size": 3.5,
            "pattern": {
              "type": "style",
              "style": "solid"
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:4",
    "title": tr('Барилга'),
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/4",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "authoringInfo": {
        "lengthUnit": "meters"
      },
      "type": "simple",
      "visualVariables": [
        {
          "type": "sizeInfo",
          "field": "Ondor_m",
          "valueUnit": "meters"
        }
      ],
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Extrude",
            "size": 1,
            "material": {
              "color": [
                255,
                219,
                158
              ]
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:3",
    "title": 'Явган_зам',
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/3",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Fill",
            "material": {
              "color": [
                0,
                0,
                0
              ]
            },
            "pattern": {
              "type": "style",
              "style": "diagonal-cross"
            },
            "outline": {
              "color": [
                0,
                0,
                0
              ],
              "size": 0.4
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:2",
    "title": tr('Автозам'),
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/2",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Fill",
            "material": {
              "color": [
                178,
                178,
                178
              ]
            },
            "pattern": {
              "type": "style",
              "style": "solid"
            },
            "outline": {
              "color": [
                255,
                255,
                255
              ],
              "size": 0.75
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:1",
    "title": 'Ногоон_байгууламж',
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/1",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "authoringInfo": {},
      "type": "simple",
      "symbol": {
        "type": "PolygonSymbol3D",
        "symbolLayers": [
          {
            "type": "Fill",
            "material": {
              "color": [
                87,
                222,
                93
              ],
              "transparency": 50,
              "colorMixMode": "replace"
            },
            "pattern": {
              "type": "style",
              "style": "solid"
            },
            "outline": {
              "color": [
                87,
                222,
                93
              ],
              "size": 0.398
            }
          }
        ]
      }
    }
  },
  {
    "id": "scene3d:5",
    "title": tr('Замын цагаан зураас'),
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/5",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "authoringInfo": {
        "colorRamp": {
          "type": "multipart",
          "colorRamps": [
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                243,
                252,
                207,
                255
              ],
              "toColor": [
                243,
                252,
                207,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                205,
                179,
                252,
                255
              ],
              "toColor": [
                205,
                179,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                179,
                183,
                255
              ],
              "toColor": [
                252,
                179,
                183,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                199,
                237,
                252,
                255
              ],
              "toColor": [
                199,
                237,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                179,
                252,
                227,
                255
              ],
              "toColor": [
                179,
                252,
                227,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                210,
                245,
                255
              ],
              "toColor": [
                252,
                210,
                245,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                218,
                189,
                255
              ],
              "toColor": [
                252,
                218,
                189,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                199,
                252,
                182,
                255
              ],
              "toColor": [
                199,
                252,
                182,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                182,
                202,
                252,
                255
              ],
              "toColor": [
                182,
                202,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                249,
                187,
                252,
                255
              ],
              "toColor": [
                249,
                187,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                210,
                252,
                245,
                255
              ],
              "toColor": [
                210,
                252,
                245,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                240,
                252,
                179,
                255
              ],
              "toColor": [
                240,
                252,
                179,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                207,
                252,
                210,
                255
              ],
              "toColor": [
                207,
                252,
                210,
                255
              ]
            }
          ]
        }
      },
      "type": "uniqueValue",
      "field1": "color",
      "defaultLabel": "",
      "defaultSymbol": {
        "type": "LineSymbol3D",
        "symbolLayers": [
          {
            "type": "Line",
            "material": {
              "color": [
                130,
                130,
                130
              ]
            },
            "join": "round",
            "cap": "round",
            "size": 1,
            "pattern": {
              "type": "style",
              "style": "solid"
            }
          }
        ]
      },
      "fieldDelimiter": ",",
      "uniqueValueGroups": [
        {
          "heading": "color",
          "classes": [
            {
              "description": "6",
              "label": "6",
              "symbol": {
                "type": "LineSymbol3D",
                "symbolLayers": [
                  {
                    "type": "Line",
                    "material": {
                      "color": [
                        255,
                        255,
                        255
                      ]
                    },
                    "join": "round",
                    "size": 1.5,
                    "pattern": {
                      "type": "style",
                      "style": "dash"
                    }
                  }
                ]
              },
              "values": [
                [
                  "6"
                ]
              ]
            },
            {
              "description": "7",
              "label": "7",
              "symbol": {
                "type": "LineSymbol3D",
                "symbolLayers": [
                  {
                    "type": "Line",
                    "material": {
                      "color": [
                        255,
                        255,
                        255
                      ]
                    },
                    "join": "round",
                    "cap": "round",
                    "size": 2,
                    "pattern": {
                      "type": "style",
                      "style": "solid"
                    }
                  }
                ]
              },
              "values": [
                [
                  "7"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "description": "6",
          "label": "6",
          "symbol": {
            "type": "LineSymbol3D",
            "symbolLayers": [
              {
                "type": "Line",
                "material": {
                  "color": [
                    255,
                    255,
                    255
                  ]
                },
                "join": "round",
                "size": 1.5,
                "pattern": {
                  "type": "style",
                  "style": "dash"
                }
              }
            ]
          },
          "value": "6"
        },
        {
          "description": "7",
          "label": "7",
          "symbol": {
            "type": "LineSymbol3D",
            "symbolLayers": [
              {
                "type": "Line",
                "material": {
                  "color": [
                    255,
                    255,
                    255
                  ]
                },
                "join": "round",
                "cap": "round",
                "size": 2,
                "pattern": {
                  "type": "style",
                  "style": "solid"
                }
              }
            ]
          },
          "value": "7"
        }
      ]
    }
  },
  {
    "id": "scene3d:0",
    "title": tr('Мод'),
    "group": null,
    "url": "https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/selbe_3D__0804_WFL1/FeatureServer/0",
    "opacity": 1,
    "elevationInfo": {
      "mode": "onTheGround"
    },
    "renderer": {
      "authoringInfo": {
        "lengthUnit": "meters"
      },
      "type": "uniqueValue",
      "valueExpression": "Text($feature.OBJECTID % 6)",
      "valueExpressionTitle": tr('Модны төрөл'),
      "defaultSymbol": {
        "type": "PointSymbol3D",
        "symbolLayers": [
          {
            "type": "Object",
            "resource": {
              "href": "https://static.arcgis.com/arcgis/styleItems/RealisticTrees/gltf/resource/UmbellulariaCalifornica.glb"
            },
            "height": 10
          }
        ]
      },
      "uniqueValueInfos": [
        {
          "value": "0",
          "label": "UmbellulariaCalifornica",
          "symbol": {
            "type": "PointSymbol3D",
            "symbolLayers": [
              {
                "type": "Object",
                "resource": {
                  "href": "https://static.arcgis.com/arcgis/styleItems/RealisticTrees/gltf/resource/UmbellulariaCalifornica.glb"
                },
                "height": 10
              }
            ]
          }
        },
        {
          "value": "1",
          "label": "AcerSaccharum",
          "symbol": {
            "type": "PointSymbol3D",
            "symbolLayers": [
              {
                "type": "Object",
                "resource": {
                  "href": "https://static.arcgis.com/arcgis/styleItems/RealisticTrees/gltf/resource/AcerSaccharum.glb"
                },
                "height": 11
              }
            ]
          }
        },
        {
          "value": "2",
          "label": "BetulaPapyrifera",
          "symbol": {
            "type": "PointSymbol3D",
            "symbolLayers": [
              {
                "type": "Object",
                "resource": {
                  "href": "https://static.arcgis.com/arcgis/styleItems/RealisticTrees/gltf/resource/BetulaPapyrifera.glb"
                },
                "height": 13
              }
            ]
          }
        },
        {
          "value": "3",
          "label": "QuercusRubra",
          "symbol": {
            "type": "PointSymbol3D",
            "symbolLayers": [
              {
                "type": "Object",
                "resource": {
                  "href": "https://static.arcgis.com/arcgis/styleItems/RealisticTrees/gltf/resource/QuercusRubra.glb"
                },
                "height": 12
              }
            ]
          }
        },
        {
          "value": "4",
          "label": "PopulusTremuloides",
          "symbol": {
            "type": "PointSymbol3D",
            "symbolLayers": [
              {
                "type": "Object",
                "resource": {
                  "href": "https://static.arcgis.com/arcgis/styleItems/RealisticTrees/gltf/resource/PopulusTremuloides.glb"
                },
                "height": 13
              }
            ]
          }
        },
        {
          "value": "5",
          "label": "LiquidambarStyraciflua",
          "symbol": {
            "type": "PointSymbol3D",
            "symbolLayers": [
              {
                "type": "Object",
                "resource": {
                  "href": "https://static.arcgis.com/arcgis/styleItems/RealisticTrees/gltf/resource/LiquidambarStyraciflua.glb"
                },
                "height": 10
              }
            ]
          }
        }
      ]
    }
  }
];
