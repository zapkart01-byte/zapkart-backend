# ZapKart Supabase Schema

## Table: `rider_locations`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **rider_id** | `string (uuid)` | Note:
This is a Foreign Key to `riders.id`.<fk table='riders' column='id'/> |
| **order_id** | `string (uuid)` | Note:
This is a Foreign Key to `orders.id`.<fk table='orders' column='id'/> |
| **lat** | `number (numeric)` | — |
| **lng** | `number (numeric)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **recorded_at** | `string (timestamp with time zone)` | — |

## Table: `banners` 
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **title** | `string (text)` | — |
| **image_url** | `string (text)` | — |
| **link_type** | `string (text)` | — |
| **link_value** | `string (text)` | — |
| **start_date** | `string (timestamp with time zone)` | — |
| **end_date** | `string (timestamp with time zone)` | — |
| **is_active** | `boolean (boolean)` | — |
| **sort_order** | `integer (integer)` | — |
| **created_at** | `string (timestamp with time zone)` | — |

## Table: `store_documents`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **store_id** | `string (uuid)` | Note:
This is a Foreign Key to `stores.id`.<fk table='stores' column='id'/> |
| **document_type** | `string (text)` | — |
| **document_url** | `string (text)` | — |
| **verified** | `boolean (boolean)` | — |
| **created_at** | `string (timestamp with time zone)` | — |

## Table: `payouts`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **recipient_type** | `string (text)` | — |
| **recipient_id** | `string (uuid)` | — |
| **recipient_name** | `string (text)` | — |
| **period_start** | `string (timestamp with time zone)` | — |
| **period_end** | `string (timestamp with time zone)` | — |
| **gross_amount** | `number (numeric)` | — |
| **commission_amount** | `number (numeric)` | — |
| **cod_deduction** | `number (numeric)` | — |
| **net_amount** | `number (numeric)` | — |
| **direction** | `string (text)` | — |
| **status** | `string (text)` | — |
| **bank_reference** | `string (text)` | — |
| **bank_details** | `undefined (jsonb)` | — |
| **processed_at** | `string (timestamp with time zone)` | — |
| **created_at** | `string (timestamp with time zone)` | — |

## Table: `orders`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **customer_id** | `string (uuid)` | Note:
This is a Foreign Key to `customers.id`.<fk table='customers' column='id'/> |
| **store_id** | `string (uuid)` | Note:
This is a Foreign Key to `stores.id`.<fk table='stores' column='id'/> |
| **rider_id** | `string (uuid)` | Note:
This is a Foreign Key to `riders.id`.<fk table='riders' column='id'/> |
| **status** | `string (text)` | — |
| **subtotal** | `number (numeric)` | — |
| **commission_amount** | `number (numeric)` | — |
| **delivery_fee** | `number (numeric)` | — |
| **rider_payout** | `number (numeric)` | — |
| **zapkart_net_profit** | `number (numeric)` | — |
| **discount_amount** | `number (numeric)` | — |
| **total** | `number (numeric)` | — |
| **delivery_address** | `undefined (jsonb)` | — |
| **payment_method** | `string (text)` | — |
| **payment_status** | `string (text)` | — |
| **cancellation_reason** | `string (text)` | — |
| **store_confirmed_at** | `string (timestamp with time zone)` | — |
| **rider_accepted_at** | `string (timestamp with time zone)` | — |
| **picked_up_at** | `string (timestamp with time zone)` | — |
| **delivered_at** | `string (timestamp with time zone)` | — |
| **cod_submitted** | `boolean (boolean)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **total_markup_amount** | `number (numeric)` | — |
| **offer_id** | `string (uuid)` | Note:
This is a Foreign Key to `offers.id`.<fk table='offers' column='id'/> |
| **discount_absorbed_by** | `string (text)` | — |
| **original_cart_value** | `number (numeric)` | — |
| **rider_event_bonus** | `number (numeric)` | — |

## Table: `customers`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **name** | `string (text)` | — |
| **phone** | `string (text)` | — |
| **email** | `string (text)` | — |
| **status** | `string (text)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **expo_push_token** | `string (text)` | — |

## Table: `audit_log`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **admin_id** | `string (text)` | — |
| **action** | `string (text)` | — |
| **target_type** | `string (text)` | — |
| **target_id** | `string (text)` | — |
| **old_value** | `undefined (jsonb)` | — |
| **new_value** | `undefined (jsonb)` | — |
| **created_at** | `string (timestamp with time zone)` | — |

## Table: `offers`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **type** | `string (text)` | — |
| **code** | `string (text)` | — |
| **name** | `string (text)` | — |
| **discount_type** | `string (text)` | — |
| **discount_value** | `number (numeric)` | — |
| **min_order_value** | `number (numeric)` | — |
| **max_discount_cap** | `number (numeric)` | — |
| **valid_from** | `string (timestamp with time zone)` | — |
| **valid_until** | `string (timestamp with time zone)` | — |
| **usage_limit** | `integer (integer)` | — |
| **usage_count** | `integer (integer)` | — |
| **is_active** | `boolean (boolean)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **per_user_limit** | `integer (integer)` | — |
| **applies_to_categories** | `array (uuid[])` | — |
| **applies_to_products** | `array (uuid[])` | — |
| **discount_absorbed_by** | `string (text)` | — |
| **rider_gets_event_bonus** | `boolean (boolean)` | — |
| **banner_image_url** | `string (text)` | — |

## Table: `admins`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **name** | `string (text)` | — |
| **email** | `string (text)` | — |
| **role** | `string (text)` | — |
| **created_at** | `string (timestamp with time zone)` | — |

## Table: `products`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **store_id** | `string (uuid)` | Note:
This is a Foreign Key to `stores.id`.<fk table='stores' column='id'/> |
| **category_id** | `string (uuid)` | Note:
This is a Foreign Key to `categories.id`.<fk table='categories' column='id'/> |
| **name** | `string (text)` | — |
| **unit** | `string (text)` | — |
| **platform_mrp** | `number (numeric)` | — |
| **store_price** | `number (numeric)` | — |
| **stock** | `integer (integer)` | — |
| **image_url** | `string (text)` | — |
| **description** | `string (text)` | — |
| **is_active** | `boolean (boolean)` | — |
| **is_flagged** | `boolean (boolean)` | — |
| **units_sold_total** | `integer (integer)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **updated_at** | `string (timestamp with time zone)` | — |
| **image_urls** | `array (text[])` | — |
| **cost_price** | `number (numeric)` | — |
| **product_group_id** | `string (uuid)` | — |
| **variant_label** | `string (text)` | — |
| **customer_price** | `number (numeric)` | — |

## Table: `riders`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **firebase_uid** | `string (text)` | — |
| **name** | `string (text)` | — |
| **phone** | `string (text)` | — |
| **vehicle_type** | `string (text)` | — |
| **vehicle_number** | `string (text)` | — |
| **status** | `string (text)` | — |
| **is_online** | `boolean (boolean)` | — |
| **bank_account** | `string (text)` | — |
| **bank_ifsc** | `string (text)` | — |
| **rating** | `number (numeric)` | — |
| **total_deliveries** | `integer (integer)` | — |
| **total_earnings** | `number (numeric)` | — |
| **cod_balance** | `number (numeric)` | — |
| **cod_limit_reached** | `boolean (boolean)` | — |
| **weekly_delivery_earnings** | `number (numeric)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **expo_push_token** | `string (text)` | — |
| **lat** | `number (numeric)` | — |
| **lng** | `number (numeric)` | — |

## Table: `order_items`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **order_id** | `string (uuid)` | Note:
This is a Foreign Key to `orders.id`.<fk table='orders' column='id'/> |
| **product_id** | `string (uuid)` | Note:
This is a Foreign Key to `products.id`.<fk table='products' column='id'/> |
| **name** | `string (text)` | — |
| **quantity** | `integer (integer)` | — |
| **store_price** | `number (numeric)` | — |
| **total_price** | `number (numeric)` | — |

## Table: `rider_documents`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **rider_id** | `string (uuid)` | Note:
This is a Foreign Key to `riders.id`.<fk table='riders' column='id'/> |
| **document_type** | `string (text)` | — |
| **document_url** | `string (text)` | — |
| **verified** | `boolean (boolean)` | — |
| **created_at** | `string (timestamp with time zone)` | — |

## Table: `platform_settings`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `integer (integer)` | Note:
This is a Primary Key.<pk/> |
| **commission_rate** | `number (numeric)` | — |
| **minimum_profit** | `number (numeric)` | — |
| **min_delivery_fee** | `number (numeric)` | — |
| **max_delivery_fee** | `number (numeric)` | — |
| **free_delivery_above** | `number (numeric)` | — |
| **minimum_order_value** | `number (numeric)` | — |
| **rider_payout_under_2km** | `number (numeric)` | — |
| **rider_payout_2_to_4km** | `number (numeric)` | — |
| **rider_payout_above_4km** | `number (numeric)` | — |
| **store_confirmation_timeout** | `integer (integer)` | — |
| **rider_acceptance_timeout** | `integer (integer)` | — |
| **max_cod_balance_per_rider** | `number (numeric)` | — |
| **store_cancellation_penalty** | `number (numeric)` | — |
| **settlement_day** | `string (text)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **platform_markup_per_item** | `number (numeric)` | — |
| **min_profit_tier1** | `number (numeric)` | — |
| **min_profit_tier2** | `number (numeric)` | — |
| **min_profit_tier3** | `number (numeric)` | — |
| **min_profit_tier4** | `number (numeric)` | — |
| **min_profit_tier5** | `number (numeric)` | — |
| **min_profit_tier1_max_cart** | `number (numeric)` | — |
| **min_profit_tier2_max_cart** | `number (numeric)` | — |
| **min_profit_tier3_max_cart** | `number (numeric)` | — |
| **min_profit_tier4_max_cart** | `number (numeric)` | — |
| **bonus_peak_hour** | `number (numeric)` | — |
| **bonus_five_star** | `number (numeric)` | — |
| **bonus_milestone_8** | `number (numeric)` | — |
| **bonus_milestone_12** | `number (numeric)` | — |
| **bonus_milestone_15** | `number (numeric)` | — |
| **bonus_bad_weather** | `number (numeric)` | — |
| **bonus_event_order** | `number (numeric)` | — |
| **offer_budget_daily** | `number (numeric)` | — |

## Table: `ai_search_log`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **customer_id** | `string (uuid)` | Note:
This is a Foreign Key to `customers.id`.<fk table='customers' column='id'/> |
| **query** | `string (text)` | — |
| **items_found** | `integer (integer)` | — |
| **items_missing** | `integer (integer)` | — |
| **created_at** | `string (timestamp with time zone)` | — |

## Table: `coupon_usage`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **offer_id** | `string (uuid)` | Note:
This is a Foreign Key to `offers.id`.<fk table='offers' column='id'/> |
| **customer_id** | `string (uuid)` | Note:
This is a Foreign Key to `customers.id`.<fk table='customers' column='id'/> |
| **order_id** | `string (uuid)` | Note:
This is a Foreign Key to `orders.id`.<fk table='orders' column='id'/> |
| **discount_amount** | `number (numeric)` | — |
| **used_at** | `string (timestamp with time zone)` | — |

## Table: `users`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **phone** | `string (text)` | — |
| **email** | `string (text)` | — |
| **role** | `string (text)` | — |
| **name** | `string (text)` | — |
| **profile_image_url** | `string (text)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **updated_at** | `string (timestamp with time zone)` | — |

## Table: `stores`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **owner_name** | `string (text)` | — |
| **owner_phone** | `string (text)` | — |
| **store_name** | `string (text)` | — |
| **store_type** | `string (text)` | — |
| **address** | `string (text)` | — |
| **lat** | `number (numeric)` | — |
| **lng** | `number (numeric)` | — |
| **delivery_radius_km** | `integer (integer)` | — |
| **gstin** | `string (text)` | — |
| **bank_account** | `string (text)` | — |
| **bank_ifsc** | `string (text)` | — |
| **status** | `string (text)` | — |
| **rating** | `number (numeric)` | — |
| **total_orders** | `integer (integer)` | — |
| **commission_rate** | `number (numeric)` | — |
| **is_open** | `boolean (boolean)` | — |
| **opening_time** | `string (time without time zone)` | — |
| **closing_time** | `string (time without time zone)` | — |
| **cancellation_count** | `integer (integer)` | — |
| **logo_url** | `string (text)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **expo_push_token** | `string (text)` | — |

## Table: `categories`
| Column | Type | Description |
| :--- | :--- | :--- |
| **id** | `string (uuid)` | Note:
This is a Primary Key.<pk/> |
| **name** | `string (text)` | — |
| **emoji** | `string (text)` | — |
| **is_active** | `boolean (boolean)` | — |
| **sort_order** | `integer (integer)` | — |
| **created_at** | `string (timestamp with time zone)` | — |
| **commission_rate** | `number (numeric)` | — |

