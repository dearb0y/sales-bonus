/**
 * Функция, которая проверяет, являются ли входные данные массивом.
 * @param {*} data Входные данные.
 * @returns {boolean}
 */
function isArray(data) {
  return Array.isArray(data);
}

/**
 * Функция, которая проверяет, являются ли входные данные функцией.
 * @param {*} data Входные данные.
 * @returns {boolean}
 */
function isFunction(data) {
  return typeof data === 'function';
}

/**
 * Функция, возвращающая стоимость покупки товара по его ID.
 * @param {string} productId ID товара.
 * @param {Array<Object>} products Массив товаров.
 * @returns {number}
 */
function getProductPurchasePrice(productId, products) {
  return products.find(({ sku }) => sku === productId).purchase_price;
}

/**
 * Функция, рассчитывающая прибыль от продажи определенного количества товара.
 * @param {number} purchasePrice Стоимость покупки товара.
 * @param {number} salePrice Стоимость продажи товара.
 * @param {number} discount Размер скидки.
 * @param {number} quantity Количество единиц товара.
 * @returns {number}
 */
function getProductProfit(purchasePrice, salePrice, discount, quantity) {
  return (salePrice * (1 - discount / 100) - purchasePrice) * quantity;
}

/**
 * Функция, рассчитывающая доход от продажи определенного количества товара.
 * @param {number} salePrice Стоимость продажи товара.
 * @param {number} discount Размер скидки.
 * @param {number} quantity Количество единиц товара.
 * @returns {number}
 */
function getProductIncome(salePrice, discount, quantity) {
  return salePrice * (1 - discount / 100) * quantity;
}

/**
 * Функция для расчета выручки.
 * @param purchase запись о покупке
 * @param _product карточка товара
 * @returns {number}
 */
function calculateSimpleRevenue(purchase, _product) {
  const { sale_price, discount, quantity } = purchase;
  return sale_price * (1 - discount / 100) * quantity;
}

/**
 * Функция, рассчитывающая доход от операции.
 * @param {Array<Object>} purchaseItems Массив товаров, проданных в рамках операции (покупки).
 * @param {function()} revenueFunc Функция расчета дохода.
 * @returns {number}
 */
function calculateTotalRevenue(purchaseItems, revenueFunc) {
  return purchaseItems.reduce((acc, item) => {
    return acc + Math.round(revenueFunc(item) * 100) / 100;
  }, 0);
}

/**
 * Функция, рассчитывающая прибыль от операции.
 * @param {Array<Object>} purchaseItems Массив товаров, проданных в рамках операции (покупки).
 * @param {function()} revenueFunc Функция расчета дохода.
 * @param {Array<Object>} products Массив товаров.
 * @returns {number}
 */
function calculateTotalProfit(purchaseItems, revenueFunc, products) {
  return purchaseItems.reduce((acc, item) => {
    return (
      acc +
      ((revenueFunc(item) - getProductPurchasePrice(item.sku, products) * item.quantity) * 100) /
        100
    );
  }, 0);
}

/**
 * Функция для расчета бонусов
 * @param index порядковый номер в отсортированном массиве
 * @param total общее число продавцов
 * @param seller карточка продавца
 * @returns {number}
 */
function calculateBonusByProfit(index, total, seller) {
  // Получаем прибыль продавца.
  const { profit } = seller;

  switch (true) {
    case index === 0:
      return profit * 0.15;
    case index > 0 && index < 3:
      return profit * 0.1;
    case index > 2 && index < total - 1:
      return profit * 0.05;
    default:
      return 0;
  }
}

/**
 * Функция для анализа данных продаж
 * @param data
 * @param options
 * @returns {{revenue, top_products, bonus, name, sales_count, profit, seller_id}[]}
 */
function analyzeSalesData(data, options) {
  // Проверка входных данных на корректность.
  if (!data || !isArray(data.sellers) || !data.sellers.length) {
    throw new Error('Некорректные входные данные.');
  }

  // Проверка опций.
  const { calculateRevenue, calculateBonus } = options;

  if (!calculateRevenue || !calculateBonus) {
    throw new Error('Каких-то опций не хватает!');
  }

  if (!isFunction(calculateRevenue) || !isFunction(calculateBonus)) {
    throw new Error('Переданы неправильные опции.');
  }

  // Представляем массив продавцов в удобном для доступа виде.
  const sellerIndex = Object.fromEntries(data.sellers.map((seller) => [seller.id, seller]));

  // Обходим массив транзакций для формирования статистики для каждого продавца.
  const sellerStats = data.purchase_records.reduce((acc, record) => {
    // Определяем базовые ключи.
    const sellerKey = record['seller_id'];
    const sellerData = sellerIndex[sellerKey];
    const items = record['items'];
    const userData = acc[sellerKey];

    // Расчет расходов, прибыли и т.д.
    const revenue = calculateTotalRevenue(items, calculateRevenue);
    const profit = calculateTotalProfit(items, calculateRevenue, data.products);

    // Если такого продавца пока не существует в накопленной статистике.
    if (!userData) {
      acc[sellerKey] = {
        id: sellerKey,
        name: `${sellerData.first_name} ${sellerData.last_name}`,
      };
    }

    // Заполняем оставшиеся данные.
    acc[sellerKey] = {
      ...acc[sellerKey],
      revenue: revenue + (userData?.revenue || 0),
      profit: profit + (userData?.profit || 0),
      sales_count: 1 + (userData?.sales_count || 0),
    };

    // Определяем статистику по проданным товарам и их количеству.
    const soldProducts = items.reduce(
      (accItems, { sku, quantity }) => ({ ...accItems, [sku]: quantity }),
      {},
    );

    acc[sellerKey].sold_products = { ...acc[sellerKey].sold_products, ...soldProducts };

    return acc;
  }, {});

  // Сортируем продавцов по убыванию прибыли.
  const sortedSellers = Object.entries(sellerStats).toSorted((a, b) => b[1].profit - a[1].profit);

  // Добавляем бонус каждому продавцу.
  const sellersWithBonus = sortedSellers.map(([_id, seller], index) => ({
    ...seller,
    bonus: +calculateBonus(index, sortedSellers.length, seller).toFixed(2),
  }));

  // Определяем ТОП продукты у каждого продавца и округляем значения.
  const sellersWithBestProducts = sellersWithBonus.map((seller) => {
    return {
      seller_id: seller.id,
      name: seller.name,
      revenue: +seller.revenue.toFixed(2),
      profit: +seller.profit.toFixed(2),
      sales_count: seller.sales_count,
      top_products: Object.entries(seller.sold_products)
        .sort((a, b) => b[1] - a[1])
        .map(([sku, quantity]) => ({
          sku,
          quantity,
        }))
        .slice(0, 10),
      bonus: +seller.bonus.toFixed(2),
    };
  });

  return sellersWithBestProducts;
}
